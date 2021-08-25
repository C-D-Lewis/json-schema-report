require('colors');
const { HIDE_OPTIONAL_VALID, VERBOSE } = require('./config');
const {
  readJsonFile,
  pad,
  resolveRefDefinition,
  getRefName,
  replaceRefs,
  validateFragment,
  multiSchemaTypes,
  inferType,
} = require('./util');

const { DEBUG } = process.env;
const [schemaPath, instancePath] = process.argv.slice(2);

let allErrorsList = [];
let inputSchema;

/**
 * Recursive validation context.
 *
 * @typedef {object} Context
 * @property {string} path - Location of this sub-schema.
 * @property {number} level - Indentation level.
 * @property {object} subSchema - Schema fragment.
 * @property {string} keyName - Key name of the property being validated.
 * @property {object} instance - Instance fragment.
 * @property {boolean} branchIsValid - True if the current branch is overall valid.
 */

/**
 * Validate an array of schemas, such as allOf/anyOf/oneOf
 * 
 * @param {Context} ctx
 * @param {string} type - Array of schemas list type, such as 'allOf'.
 * @param {Array<object>} schemaArray - Array of schemas.
 */
const validateArrayOfSchemas = (ctx, type, schemaArray) => {
  const { level, keyName, branchIsValid, instance } = ctx;

  ctx.arraySchemaValid = false;
  let numValidSchemas = 0;

  schemaArray.forEach((subSchema, i, arr) => {
    // One of the array of candidate schemas has already been validated
    if (ctx.arraySchemaValid) return;

    const color = branchIsValid ? 'green' : 'red';
    console.log(`${pad(level)}[`.grey + keyName[color] +` ${type} ${i + 1} of ${arr.length}]`.grey);

    // If this schema validates, we found a valid candidate
    const errorMessage = validateFragment(subSchema, instance, inputSchema);
    if (!errorMessage) {
      numValidSchemas += 1;
    }

    // Did we satisfy the multiSchema type?
    let matched = false;
    if (type === 'allOf') {
      matched = numValidSchemas === schemaArray.length;
    }
    if (type === 'anyOf') {
      matched = numValidSchemas > 0;
    }
    if (type === 'oneOF') {
      matched = numValidSchemas === 1;
    }

    // Show overall result
    if (matched) {
      console.log(`${pad(level + 1)}✓ matching`.green);
    } else {
      console.log(`${pad(level + 1)}? not matching`.grey);
    }

    // If this branch is valid and we're not in verbose mode, don't show other candidate errors
    if (ctx.branchIsValid && !VERBOSE) return;

    // Treat as invalid, dive deeper
    validatePropertySchema({
      ...ctx,
      level: level + 1,
      subSchema,
    });
  });
};

/**
 * Validate all the given properties of a schema against the current instance.
 *
 * @param {Context} ctx
 * @param {object} properties - Current subschema properties.
 */
const validateObjectProperties = (ctx, properties) => {
  const { path, level, subSchema, instance } = ctx;
  const { required = [] } = subSchema;

  Object
    .entries(properties)
    .forEach(([propName, propSchema]) => {
      const propPath = `${path}.${propName}`;

      // Property is required, but was absent
      if (required.includes(propName) && !instance[propName]) {
        const output = `${pad(level)}✕ ${propPath}`.red + ' - required property is missing';
        allErrorsList.push(output);
        console.log(output);
        return;
      }

      // Not required, allow absence
      if (!instance[propName]) {
        // Unless option set to hide these hints
        if (HIDE_OPTIONAL_VALID) return;

        console.log(`${pad(level)}? ${propPath} (omitted, not required)`.grey);
        return;
      }

      // Resolve $refs
      propSchema = replaceRefs(propSchema, inputSchema);

      // Recurse into required property and it's schema
      const subInstance = instance[propName];
      validatePropertySchema({
        ...ctx,
        path: propPath,
        subSchema: propSchema,
        keyName: propName,
        instance: subInstance,
      });
    });
};

/**
 * Validate a single basic property
 *
 * @param {Context} ctx
 */
const validateBasicProperty = (ctx) => {
  const { path, level, keyName, subSchema, instance } = ctx;

  // Array basic type are all validated separately, but the index is in keyName
  // Add the index of the item if it's not already in the path
  const suffix = keyName.includes('[') && !path.includes('[') ? keyName.slice(keyName.indexOf('[')) : '';

  let output;
  const errorMessage = validateFragment(subSchema, instance, inputSchema) || '';
  if (errorMessage) {
    output = `${pad(level)}✕ ${path}${suffix}`.red + ` - ${errorMessage}`;
    allErrorsList.push(output);

    ctx.branchIsValid = false;
  } else {
    output = `${pad(level)}✓ ${path}${suffix}`.green;
  }

  console.log(output);
};

/**
 * Validate an array of basic properties.
 *
 * @param {Context} ctx
 * @param {object} items - 'items' array schema.
 */
const validateArrayOfBasicProperties = (ctx, items) => {
  const { path, level, keyName, instance } = ctx;

  instance.forEach((arrayItem, i) => {
    let arraySchema = items;

    // Array type, but no schema for the items - assume
    if (!items) {
      console.log(`${pad(level)}! Schema type 'array' does not specify schema for 'items'`);
      arraySchema = { type: 'any' };
    }

    validatePropertySchema({
      ...ctx,
      path: `${path}[${i}]`,
      subSchema: arraySchema,
      keyName: `${keyName}[${i}]`,
      instance: arrayItem,
    });
  });
};

/**
 * Validate a sub-schema.
 *
 * @param {Context} ctx
 */
const validatePropertySchema = (ctx) => {
  const { level, subSchema, keyName, instance } = ctx;

  ctx.branchIsValid = !validateFragment(subSchema, instance, inputSchema);

  // Schema is just a $ref
  if (subSchema.$ref) {
    if (DEBUG) console.log(`${pad(level)}mode: $ref`.grey);

    const resolvedSubSchema = resolveRefDefinition(inputSchema, subSchema.$ref);
    const refName = getRefName(subSchema.$ref);
    validatePropertySchema({
      ...ctx,
      subSchema: resolvedSubSchema,
      keyName: refName,
    });
    return;
  }

  // No type in this schema fragment, attempt to infer
  if (!subSchema.type) {
    subSchema.type = inferType(level, subSchema);
  }

  if (DEBUG) console.log(JSON.stringify({ subSchema, instance }, null, 2));

  const { items } = subSchema;

  // Array of items with $ref
  if (items && items.$ref) {
    if (DEBUG) console.log(`${pad(level)}mode: items.$ref`.grey);

    // Resolve $ref for the 'items'
    subSchema.items = resolveRefDefinition(inputSchema, subSchema.items.$ref);

    // Validate each item in array against a given array schema
    instance.forEach((p, i) => {
      validatePropertySchema({
        ...ctx,
        subSchema: subSchema.items,
        keyName: `${keyName}[${i}]`,
        instance: p,
      });
    });
    return;
  }

  // Array of items with anyOf/allOf/oneOf as the 'items' schema
  if (Array.isArray(instance) && items && multiSchemaTypes.some(p => !!items[p])) {
    if (DEBUG) console.log(`${pad(level)}mode: items.allOf/anyOf/oneOf`.grey);

    multiSchemaTypes
      .filter(p => items[p])
      .forEach((multiSchemaType) => {
        // Validate each item in array against a given array schema, like allOf
        instance.forEach(
          arrayItem => validateArrayOfSchemas(
            { ...ctx, instance: arrayItem },
            multiSchemaType,
            items[multiSchemaType],
          )
        );
      });
    return;
  }

  // Current subSchema is anyOf/allOf/oneOf directly
  if (multiSchemaTypes.some(p => !!subSchema[p])) {
    if (DEBUG) console.log(`${pad(level)}mode: allOf/anyOf/oneOf`.grey);

    multiSchemaTypes
      .filter(p => subSchema[p])
      .forEach(
        multiSchemaType => validateArrayOfSchemas(ctx, multiSchemaType, subSchema[multiSchemaType])
      );
    return;
  }

  const { properties, type } = subSchema;

  // Array of basic fields
  if (Array.isArray(instance) && type === 'array') {
    if (DEBUG) console.log(`${pad(level)}mode: type: array`.grey);

    validateArrayOfBasicProperties(ctx, items);
    return;
  }

  // Basic field
  if (!properties && type) {
    if (DEBUG) console.log(`${pad(level)}mode: basic type`.grey);

    validateBasicProperty(ctx);
    return;
  }

  // Child 'properties' in subSchema
  if (properties) {
    if (DEBUG) console.log(`${pad(level)}mode: properties`.grey);

    validateObjectProperties(ctx, properties);
    return;
  }

  throw new Error(`Unhandled schema shape:\n${JSON.stringify({ subSchema, instance }, null, 2)}`);
};

/**
 * Main validation function.
 * 
 * @param {object} schema - Schema to test.
 * @param {object} instance - Instance to test.
 * @returns {Array<string>} List of errors.
 */
const validateSchema = (schema, instance) => {
  if (typeof schema !== 'object' || typeof instance !== 'object') {
    throw new Error('Schema or instance was not a valid object');
  }

  // For both cli and tests, use the schema passed here
  inputSchema = { ...schema };

  // Handle top-level allOf/anyOf/oneOf
  schema = replaceRefs(schema, inputSchema);

  allErrorsList = [];
  const startingCtx = {
    path: '',
    level: 1,
    subSchema: schema,
    keyName: '/',
    instance,
    branchIsValid: true,
  };
  validatePropertySchema(startingCtx);
  return allErrorsList;
};

/**
 * The main function.
 */
const main = () => {
  if (!schemaPath || !instancePath) {
    console.log('\nUsage:\n  jsr $schemaFilePath $dataFilePath [-v|-o]\n');
    return;
  }

  const schema = readJsonFile(schemaPath);
  const instance = readJsonFile(instancePath);

  console.log();
  validateSchema(schema, instance);
  console.log(`\n${allErrorsList.length} errors found.`);

  const overallError = validateFragment(schema, instance, schema);
  if (!overallError) {
    console.log(`\nOverall, the data was valid\n`.green);
  } else {
    console.log(`\nOverall, the data was NOT valid\n`.red);
  }
};

module.exports = {
  validateSchema,
  main,
};
