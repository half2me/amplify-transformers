import { Transformer, gql, TransformerContext, InvalidDirectiveError } from 'graphql-transformer-core'
import { toUpper, ResourceConstants, ModelResourceIDs, ResolverResourceIDs } from 'graphql-transformer-common'
import { AppSync, Fn } from 'cloudform-types'
import {
  ObjectTypeDefinitionNode,
  DirectiveNode,
  InterfaceTypeDefinitionNode,
  FieldDefinitionNode,
  ArgumentNode,
  valueFromASTUntyped,
} from 'graphql'
import { PipelineResolverResourceIDs } from './PipelineResolverResourceIDs'

const s3BaseUrl = 's3://${S3DeploymentBucket}/${S3DeploymentRootKey}/resolvers/${ResolverFileName}'
const pipelineStack = 'FunctionDirectiveStack'

class DynamoDBTransformer extends Transformer {
  constructor() {
    super(
      'DynamoDBTransformer',
      // prettier-ignore
      gql`
        directive @dynamodb(table: String!, name: String, template: DynamoDBResolverTemplateMap) repeatable on FIELD_DEFINITION

        input DynamoDBResolverTemplateMap {
          request: String
          response: String
        }
      `,
    )
  }

  public field = (
    parent: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
    definition: FieldDefinitionNode,
    directive: DirectiveNode,
    ctx: TransformerContext,
  ) => {
    const isArg = (s: string) => (arg: ArgumentNode) => arg.name.value === s
    const getArg = (arg: string, dflt?: any) => {
      const argument = directive.arguments.find(isArg(arg))
      return argument ? valueFromASTUntyped(argument.value) : dflt
    }

    const table = toUpper(getArg('table'))
    const field = definition.name.value
    const type = parent.name.value
    const name = getArg('name')
    const {
      request: requestTemplate = `${type}.${field}.req.vtl`,
      response: responseTemplate = `${type}.${field}.res.vtl`,
    } = getArg('template', {})

    // Add a normal resolver
    const resolverKey = ResolverResourceIDs.ResolverResourceID(type, field)
    const resolver = ctx.getResource(resolverKey)
    if (!resolver) {
      // There is no resolver already configured, lets make a new one
      ctx.setResource(resolverKey, this.resolver(table, field, type, requestTemplate, responseTemplate))
      ctx.mapResourceToStack(table, resolverKey)
    } else if (resolver.Properties.Kind === 'PIPELINE') {
      if (!name) {
        throw new InvalidDirectiveError('Name must be specified when in pipeline context')
      }
      // We are in a pipeline context, instead of a resolver, we need to add a function to the pipeline
      const {
        request: pipelineRequestTemplate = `${type}.${field}.${name}.req.vtl`,
        response: pipelineResponseTemplate = `${type}.${field}.${name}.res.vtl`,
      } = getArg('template', {})

      const func = this.func(table, field, type, name, pipelineRequestTemplate, pipelineResponseTemplate)
      const funcName = PipelineResolverResourceIDs.DynamoDBAppSyncFunctionConfigurationID(field, type, name)
      ctx.setResource(funcName, func)
      ctx.mapResourceToStack(pipelineStack, funcName)
      ctx.setResource(resolverKey, this.appendFunctionToResolver(resolver as AppSync.Resolver, funcName))
    }
  }

  resolver = (table: string, field: string, type: string, reqTemplate: string, resTemplate: string) => {
    return new AppSync.Resolver({
      ...this.conf(table, reqTemplate, resTemplate),
      FieldName: field,
      TypeName: type,
    })
  }

  func = (table: string, field: string, type: string, name: string, reqTemplate: string, resTemplate: string) => {
    return new AppSync.FunctionConfiguration({
      ...this.conf(table, reqTemplate, resTemplate),
      Name: PipelineResolverResourceIDs.DynamoDBAppSyncFunctionConfigurationID(field, type, name),
      FunctionVersion: '2018-05-29',
    }).dependsOn(ModelResourceIDs.ModelTableDataSourceID(table)) // TODO: not sure if we need this bit
  }

  conf = (table: string, reqTemplate: string, resTemplate: string) => ({
    ApiId: Fn.GetAtt(ResourceConstants.RESOURCES.GraphQLAPILogicalID, 'ApiId'),
    DataSourceName: Fn.GetAtt(ModelResourceIDs.ModelTableDataSourceID(table), 'Name'),
    RequestMappingTemplateS3Location: Fn.Sub(s3BaseUrl, {
      [ResourceConstants.PARAMETERS.S3DeploymentBucket]: Fn.Ref(ResourceConstants.PARAMETERS.S3DeploymentBucket),
      [ResourceConstants.PARAMETERS.S3DeploymentRootKey]: Fn.Ref(ResourceConstants.PARAMETERS.S3DeploymentRootKey),
      ResolverFileName: reqTemplate,
    }),
    ResponseMappingTemplateS3Location: Fn.Sub(s3BaseUrl, {
      [ResourceConstants.PARAMETERS.S3DeploymentBucket]: Fn.Ref(ResourceConstants.PARAMETERS.S3DeploymentBucket),
      [ResourceConstants.PARAMETERS.S3DeploymentRootKey]: Fn.Ref(ResourceConstants.PARAMETERS.S3DeploymentRootKey),
      ResolverFileName: resTemplate,
    }),
  })

  appendFunctionToResolver = (resolver: AppSync.Resolver, functionId: string) => {
    if (Array.isArray(resolver.Properties.PipelineConfig.Functions)) {
      resolver.Properties.PipelineConfig.Functions.push(Fn.GetAtt(functionId, 'FunctionId'))
    } else {
      throw new Error('Unable to add function to resolver')
    }
    return resolver.dependsOn(functionId)
  }
}

export default DynamoDBTransformer
export { DynamoDBTransformer }
