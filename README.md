# json-schema-report

Visual tool to debug JSON schema validation errors field-by-field. I couldn't
find any tool that did in-depth reporting on why a schema failed, so I made this
one.

For example, showing valid (✓), invalid or missing (✕), and optional missing
(?) properties with colored output to aid in reading:

```

  ✓ .name
  ✕ .age - instance must be greater than or equal to 0
  ✓ .address.line1
  ✓ .address.line2
  ✓ .address.city
  ✕ .address.state - required property is missing
  ✓ .address.country
  ? .catchphrase

2 errors found.
```

Where a schema uses `allOf`, `anyOf`, or `oneOf`, all the possible alternatives
are shown, so you can see how much each one matched against the other
candidates. This can mean that data that does not match any of the candidates
will show errors for _all_ of them.

The example below shows where a `oneOf` matched only the second candidate.

TODO: Option to hide alternative candidates when one fully matches in
retrospect.

```
  [oneOf 1/2]
    ✓ .color
    ✓ .length
    ? .numMasts (omitted, not required)
    ✓ .topSpeed
  [oneOf 2/2]
    ✓ .color
    ✓ .length
    ? .numMasts (omitted, not required)
    ✕ .numSails - required property is missing
```

## Options

Use optional flags to adjust behavior.

* `-i` - Show inferred types.
* `-e` - Show only fields that explicitly failed, hiding good and neutral ones.

## Install

Install as a command line tool:

```
npm i -g json-schema-report
```

Then use the command:

```
jsr $schemaFilePath $dataFilePath
```

## Run tests

```
npm test
```