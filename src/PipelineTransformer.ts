import { Transformer, gql, TransformerContext } from "graphql-transformer-core";
import {
  ResourceConstants,
  ResolverResourceIDs,
} from "graphql-transformer-common";
import {
  qref,
  ref,
  printBlock,
  compoundExpression,
  str,
  methodCall,
  toJson,
  print,
} from "graphql-mapping-template";
import { AppSync, Fn } from "cloudform-types";
import {
  ObjectTypeDefinitionNode,
  DirectiveNode,
  InterfaceTypeDefinitionNode,
  FieldDefinitionNode,
} from "graphql";

const pipelineStack = "FunctionDirectiveStack";

class PipelineTransformer extends Transformer {
  constructor() {
    super(
      "PipelineTransformer",
      gql`
        directive @pipeline on FIELD_DEFINITION
      `
    );
  }

  public field = (
    parent: ObjectTypeDefinitionNode | InterfaceTypeDefinitionNode,
    definition: FieldDefinitionNode,
    directive: DirectiveNode,
    ctx: TransformerContext
  ) => {
    const field = definition.name.value;
    const type = parent.name.value;

    // Add a pipeline resolver
    const resolverKey = ResolverResourceIDs.ResolverResourceID(type, field);
    const resolver = ctx.getResource(resolverKey);
    if (!resolver) {
      ctx.setResource(resolverKey, this.resolver(field, type));
      ctx.mapResourceToStack(pipelineStack, resolverKey);
    }
  };

  resolver = (field: string, type: string): AppSync.Resolver => {
    return new AppSync.Resolver({
      ApiId: Fn.GetAtt(
        ResourceConstants.RESOURCES.GraphQLAPILogicalID,
        "ApiId"
      ),
      FieldName: field,
      TypeName: type,
      Kind: "PIPELINE",
      PipelineConfig: {
        Functions: [], // we don't specify the functions, as those need to be added by other directives
      },
      RequestMappingTemplate: printBlock("Stash resolver specific context.")(
        compoundExpression([
          qref(methodCall(ref("ctx.stash.put"), str("typeName"), str(type))),
          qref(methodCall(ref("ctx.stash.put"), str("fieldName"), str(field))),
        ])
      ),
      ResponseMappingTemplate: print(toJson(ref("ctx.prev.result"))),
    });
  };
}

export default PipelineTransformer;
export { PipelineTransformer };
