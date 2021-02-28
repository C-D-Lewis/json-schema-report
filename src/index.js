const {
  readJsonFile,
  pad,
  resolveRef,
  replaceRefs,
  validateFragment,
  multiSchemaTypes,
  inferType,
} = require('./util');

const { DEBUG } = process.env;
const [schemaPath, instancePath] = process.argv.slice(2);

let errorList = [];

/**
 * Validate an array of schemas, such as allOf/anyOf/oneOf
 * 
 * @param {string} path - Location of this sub-schema.
 * @param {number} level - Indentation level.
 * @param {object} schema - Top level schema including definitions.
 * @param {string} arr - Array of schemas.
 * @param {string} type - Array of schemas list type.
 * @param {object} instance - Instance fragment.
 */
const validateArrayOfSchemas = (path, level, schema, arr, type, instance) => {
  arr.forEach((sub, i, arr) => {
    console.log(`${pad(level)}[${type} ${i + 1}/${arr.length}]`);
    validatePropertySchema(path, level + 1, schema, sub, instance);
  });
};

/**
 * Validate a sub-schema.
 * 
 * @param {string} path - Location of this sub-schema.
 * @param {number} level - Indentation level.
 * @param {object} schema - Top level schema including definitions.
 * @param {object} subSchema - Schema fragment.
 * @param {object} instance - Instance fragment.
 */
const validatePropertySchema = (path, level, schema, subSchema, instance) => {
  // Schema is just a $ref
  if (subSchema.$ref) {
    const resolvedSubSchema = resolveRef(schema, subSchema.$ref);
    validatePropertySchema(path, level, schema, resolvedSubSchema, instance);
    return;
  }

  // No type in this schema fragment, attempt to infer
  if (!subSchema.type) {
    subSchema.type = inferType(level, subSchema);
  }

  const { required = [], properties, type, items } = subSchema;
  if (DEBUG) console.log(JSON.stringify({ subSchema, instance }, null, 2));

  // Array of items with $ref
  if (items && items.$ref) {
    subSchema.items = resolveRef(schema, subSchema.items.$ref);

    validatePropertySchema(path, level, schema, subSchema.items, instance);
    return;
  }

  // Array of items with anyOf/allOf/oneOf
  // TODO: Collate errors inside and add a flag to show them
  if (Array.isArray(instance) && items && multiSchemaTypes.some(type => items[type])) {
    multiSchemaTypes
      .filter(p => items[p])
      .forEach((listType) => {
        // Validate each item in array against a given array schema
        instance.forEach((p) => {
          validateArrayOfSchemas(path, level, schema, items[listType], listType, p);
        });
      });
    return;
  }

  // anyOf/allOf/oneOf
  if (multiSchemaTypes.some(type => subSchema[type])) {
    multiSchemaTypes
      .filter(p => subSchema[p])
      .forEach((listType) => {
        validateArrayOfSchemas(path, level, schema, subSchema[listType], listType, instance);
      });
    return;
  }

  // Array of basic fields
  if (Array.isArray(instance) && type === 'array') {
    instance.forEach((item, i) => {
      validatePropertySchema(`${path}[${i}]`, level, schema, items, item);
    });
    return;
  }

  // Basic field
  if (!properties && type) {
    const errorMessage = validateFragment(subSchema, instance) || '';
    let output = `${pad(level)}${errorMessage ? '✕': '✓'} ${path}`;
    if (errorMessage) {
      output += ` ${errorMessage ? `- ${errorMessage}` : ''}`;
      errorList.push(output);
    }

    console.log(output);
    return;
  }

  // Sub-schemas exist
  if (properties) {
    Object
      .entries(properties)
      .forEach(([name, propertySchema]) => {
        const subKeyPath = `${path}.${name}`;
        // Property is absent, but was required
        if (required.includes(name) && !instance[name]) {
          const output = `${pad(level)}✕ ${subKeyPath} - required property is missing`;
          errorList.push(output);
          console.log(output);
          return;
        }

        // Not required, allow absence
        if (!instance[name]) {
          console.log(`${pad(level)}? ${subKeyPath}`);
          return;
        }

        // Resolve $refs
        propertySchema = replaceRefs(propertySchema, schema);

        // Recurse
        const subInstance = instance[name];
        validatePropertySchema(subKeyPath, level, schema, propertySchema, subInstance);
      });
    return;
  }

  throw new Error(`Unhandled schema:\n${JSON.stringify({ subSchema, instance }, null, 2)}`);
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

  // Handle top-level allOf/anyOf/oneOf
  schema = replaceRefs(schema, schema);

  errorList = [];
  validatePropertySchema('', 1, schema, schema, instance);
  return errorList;
};

/**
 * The main function.
 */
const main = () => {
  if (!schemaPath) throw new Error('Schema path not specified');
  if (!instancePath) throw new Error('Instance path not specified');

  const schema = readJsonFile(schemaPath);
  const instance = readJsonFile(instancePath);

  console.log();
  validateSchema(schema, instance);
  console.log(`\n${errorList.length} errors found.\n`);
};

module.exports = {
  validateSchema,
  main,
};
