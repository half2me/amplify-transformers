import { Transformer, gql, TransformerContext } from 'graphql-transformer-core'
import { ResourceConstants, ResolverResourceIDs } from 'graphql-transformer-common'
import { AppSync, Fn } from 'cloudform-types'
import {
  ObjectTypeDefinitionNode,
  DirectiveNode,
  InterfaceTypeDefinitionNode,
  FieldDefinitionNode,
  ArgumentNode,
  valueFromASTUntyped,
} from 'graphql'

const s3BaseUrl = 's3://${S3DeploymentBucket}/${S3DeploymentRootKey}/resolvers/${ResolverFileName}'
const pipelineStack = 'FunctionDirectiveStack'

class PipelineTransformer extends Transformer {
  constructor() {
    super(
      'PipelineTransformer',
      gql`
        directive @pipeline(template: PipelineResolverTemplateMap) on FIELD_DEFINITION

        input PipelineResolverTemplateMap {
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

    const field = definition.name.value
    const type = parent.name.value
    const {
      request: requestTemplate = `${type}.${field}.req.vtl`,
      response: responseTemplate = `${type}.${field}.res.vtl`,
    } = getArg('template', {})

    // Add a pipeline resolver
    const resolverKey = ResolverResourceIDs.ResolverResourceID(type, field)
    const resolver = ctx.getResource(resolverKey)
    if (!resolver) {
      ctx.setResource(resolverKey, this.resolver(field, type, requestTemplate, responseTemplate))
      ctx.mapResourceToStack(pipelineStack, resolverKey)
    }
  }

  resolver = (field: string, type: string, reqTemplate: string, resTemplate: string) => {
    return new AppSync.Resolver({
      ApiId: Fn.GetAtt(ResourceConstants.RESOURCES.GraphQLAPILogicalID, 'ApiId'),
      FieldName: field,
      TypeName: type,
      Kind: 'PIPELINE',
      PipelineConfig: {
        Functions: [], // we don't specify the functions, as those need to be added by other directives
      },
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
  }
}

export default PipelineTransformer
export { PipelineTransformer }
