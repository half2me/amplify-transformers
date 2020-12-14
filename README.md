# Amplify Transformers

A collection of useful transformers for your GraphQL schema

## Installation

Install with `npm install --save @halftome/amplify-transformers`

## Usage

### Setup Custom Transformers

Edit `amplify/backend/api/<YOUR_API>/transform.conf.json` and append the following:

```json
"transformers": [
  "@halftome/amplify-transformers/PipelineTransformer",
  "@halftome/amplify-transformers/DynamoDBTransformer"
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
  fooBaz: Foo
    @dynamodb(
      table: "Foo"
      template: { request: "FooBaz.req.vtl", response: "FooBaz.res.vtl" }
    )
}
```

You can specify the resolver template location, or the defaults will be `Query.fooBar.req.vtl` and `Query.fooBar.res.vtl` generated from the type and the field.
Note: The resolver templates are not generated, you need to make them yourself. This directive just takes care of adding the `AWSResolver` to the cloudformation stack.

### Pipeline

Use the `@pipeline` directive to attach a Pipeline resolver to your field. This will just create an empty pipeline. To add functions to the pipeline, use the other directives. Note: At some point you will be able to use the `@function` directive that comes with Amplify by default. More testing is needed for this.

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

  fooBarBaz2: FooBaz
    @pipeline(
      template: {
        request: "FooBazPipeline.req.vtl"
        response: "FooBazPipeline.res.vtl"
      }
    )
    @dynamodb(
      table: "Foo"
      name: "GetFoo"
      template: { request: "GetFoo.req.vtl", response: "GetFoo.res.vtl" }
    )
    @dynamodb(
      table: "Baz"
      name: "GetBaz"
      template: { request: "GetBaz.req.vtl", response: "GetBaz.res.vtl" }
    )
}
```

This will create a pipeline which executes two dynamodb resolvers one after another. First `Foo`, then `Baz`
