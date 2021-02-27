# json-schema-debug

Visual tool to debug JSON schema validation errors field-by-field. I couldn't
find any tool that did in-depth reporting on why a schema failed, so I made this
one.

For example:

```

  ✓ .name
  ✕ .age
    - instance must be greater than or equal to 0
  ✓ .address.line1
  ✓ .address.line2
  ✓ .address.city
  ? .address.state
    - required property is missing
  ✓ .address.country

2 errors found.
```

TODO: Support top-level `allOf`/`anyOf`/`oneOf`.

## Install

Install as a command line tool:

```
npm i -g json-schema-debug
```

Then use the command:

```
jsd $schemaFilePath $dataFilePath
```

## Run tests

```
npm test
```