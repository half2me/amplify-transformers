import { simplifyName } from 'graphql-transformer-common'

export class PipelineResolverResourceIDs {
  static DynamoDBAppSyncFunctionConfigurationID(field: string, type: string, name: string) {
    return `${simplifyName(type)}${simplifyName(field)}${simplifyName(name)}Function`
  }
}
