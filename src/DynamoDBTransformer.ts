import {
  Transformer,
  gql,
  TransformerContext,
  InvalidDirectiveError,
} from "graphql-transformer-core";
import {
  obj,
  str,
  ref,
  print,
  compoundExpression,
  ifElse,
  methodCall,
  toJson,
  set,
} from "graphql-mapping-template";
import {
  toUpper,
  ResourceConstants,
  ModelResourceIDs,
  ResolverResourceIDs,
} from "graphql-transformer-common";
import { AppSync, Fn } from "cloudform-types";
import {
  ObjectTypeDefinitionNode,
  DirectiveNode,
  InterfaceTypeDefinitionNode,
  FieldDefinitionNode,
  ArgumentNode,
  valueFromASTUntyped,
} from "graphql";
import { PipelineResolverResourceIDs } from "./PipelineResolverResourceIDs";

const pipelineStack = "FunctionDirectiveStack";

class DynamoDBTransformer extends Transformer {
  constructor() {
    super(
      "DynamoDBTransformer",
      // prettier-ignore
      gql`
        directive @dynamodb(table: String!, name: String) repeatable on FIELD_DEFINITION
      `
    );
  }

  public field = (
    parent: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
    definition: FieldDefinitionNode,
    directive: DirectiveNode,
    ctx: TransformerContext
  ) => {
    const isArg = (s: string) => (arg: ArgumentNode) => arg.name.value === s;
    const getArg = (arg: string, dflt?: any) => {
      const argument = directive.arguments.find(isArg(arg));
      return argument ? valueFromASTUntyped(argument.value) : dflt;
    };

    const table = toUpper(getArg("table"));
    const field = definition.name.value;
    const type = parent.name.value;
    const name = getArg("name");

    // Add a normal resolver
    const resolverKey = ResolverResourceIDs.ResolverResourceID(type, field);
    const resolver = ctx.getResource(resolverKey);
    if (!resolver) {
      // There is no resolver already configured, lets make a new one
      ctx.setResource(resolverKey, this.resolver(table, field, type));
      ctx.mapResourceToStack(table, resolverKey);
    } else if (resolver.Properties.Kind === "PIPELINE") {
      if (!name) {
        throw new InvalidDirectiveError(
          "Name must be specified when in pipeline context"
        );
      }
      // We are in a pipeline context, instead of a resolver, we need to add a function to the pipeline

      const func = this.func(table, field, type, name);
      const funcName = PipelineResolverResourceIDs.DynamoDBAppSyncFunctionConfigurationID(
        field,
        type,
        name
      );
      ctx.setResource(funcName, func);
      ctx.mapResourceToStack(pipelineStack, funcName);
      ctx.setResource(
        resolverKey,
        this.appendFunctionToResolver(resolver as AppSync.Resolver, funcName)
      );
    }
  };

  resolver = (table: string, field: string, type: string): AppSync.Resolver => {
    return new AppSync.Resolver({
      ...this.conf(table, field, type),
      FieldName: field,
      TypeName: type,
    });
  };

  func = (
    table: string,
    field: string,
    type: string,
    name: string
  ): AppSync.FunctionConfiguration => {
    return new AppSync.FunctionConfiguration({
      ...this.conf(table, field, type),
      Name: PipelineResolverResourceIDs.DynamoDBAppSyncFunctionConfigurationID(
        field,
        type,
        name
      ),
      FunctionVersion: "2018-05-29",
    });
  };

  conf = (table: string, field: string, type: string) => ({
    ApiId: Fn.GetAtt(ResourceConstants.RESOURCES.GraphQLAPILogicalID, "ApiId"),
    DataSourceName: `${table}Table`, // would prefer to use Fn.GetAtt(ModelResourceIDs.ModelTableDataSourceID(table),"Name"), but it doesn't work for some strange reason
    RequestMappingTemplate: print(
      compoundExpression([
        set(
          ref("req"),
          obj({
            version: str("2018-05-29"),
          })
        ),
        methodCall(ref("util.error"), str("Template not implemented")),
        toJson(ref("req")),
      ])
    ),
    ResponseMappingTemplate: print(
      compoundExpression([
        ifElse(
          ref("ctx.error"),
          methodCall(
            ref("util.error"),
            ref("ctx.error.message"),
            ref("ctx.error.type")
          ),
          toJson(ref("ctx.result"))
        ),
      ])
    ),
  });

  appendFunctionToResolver = (
    resolver: AppSync.Resolver,
    functionId: string
  ) => {
    if (Array.isArray(resolver.Properties.PipelineConfig.Functions)) {
      resolver.Properties.PipelineConfig.Functions.push(
        Fn.GetAtt(functionId, "FunctionId")
      );
    } else {
      throw new Error("Unable to add function to resolver");
    }
    return resolver.dependsOn(functionId);
  };
}

export default DynamoDBTransformer;
export { DynamoDBTransformer };
