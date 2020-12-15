# Amplify Transformers

A collection of useful transformers for your GraphQL schema

## Installation

Install with `npm install --save @halftome/amplify-transformers`

## Usage

### Setup Custom Transformers

Edit `amplify/backend/api/<YOUR_API>/transform.conf.json` and append the following:

```json
"transformers": [
  "@halftome/amplify-transformers/dist/PipelineTransformer",
  "@halftome/amplify-transformers/dist/DynamoDBTransformer"
]
```

### DynamoDB

Use the `@dynamodb` directive to attach a DynamoDB resolver to your field.

Example:

```graphql
type Foo @model {
  id: ID!
  name: String!
}

type Query {
  fooBar: Foo @dynamodb(table: "Foo")
}
```

The default templates will be `Query.fooBar.req.vtl` and `Query.fooBar.res.vtl` generated from the type and the field. If they don't exist, they will be generated, but you need to change the content of the request mapping template.

### Pipeline

Use the `@pipeline` directive to attach a Pipeline resolver to your field. This will just create an empty pipeline. To add functions to the pipeline, use the other directives.

Example:

```graphql
type Foo @model {
  id: ID!
  name: String!
}

type Baz @model {
  id: ID!
  name: String!
}

type Query {
  fooBarBaz: FooBaz
    @pipeline
    @dynamodb(table: "Foo", name: "GetFoo")
    @dynamodb(table: "Baz", name: "GetBaz")
}
```

This will create a pipeline which executes two dynamodb resolvers one after another. First `Foo`, then `Baz`. Their request mapping templates are in the `pipelineFunctions` directory, and need to be overriden to do anything useful.

## Known Issues / Gotchas

When chaining directives, their order is not necessarily in the order they are written in GraphQL. See this issue for details: https://github.com/aws-amplify/amplify-cli/issues/6176 This is why its important to have the pipeline transformer defined first in `transform.conf.json`. Hopefully this will be fixed soon, and it will allow us to use the `@function` directive with the `@pipeline`
