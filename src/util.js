const { readFileSync } = require('fs');
const { validate } = require('jsonschema');

const multiSchemaTypes = ['anyOf', 'allOf', 'oneOf'];

/**
 * Read a JSON file.
 *
 * @param {string} path - Input file path.
 * @returns {object}
 */
const readJsonFile = path => JSON.parse(readFileSync(path, 'utf8'));

/**
 * Produce a padding.
 *
 * @param {number} level - Number of levels indented.
 */
const pad = level => '  '.repeat(level);

/**
 * Validate a schema fragment with an instance fragment.
 * 
 * @param {object} schema - Schema fragment.
 * @param {object} instance - Instance fragment.
 * @returns {string} First error stack.
 */
const validateFragment = (schema, instance) => {
  const { errors } = validate(instance, schema);
  return errors.length ? errors[0].stack : undefined;
};

/**
 * Resolve a definition from $ref string.
 * 
 * @param {object} schema - Top level schema containing definitions.
 * @param {string} $ref - Ref string.
 * @returns {object} Resolved definition.
 */
const resolveRef = (schema, $ref) => {
  const refName = $ref.split('/').pop();
  const definition = schema.definitions && schema.definitions[refName];
  if (!definition) throw new Error(`Definition ${refName} not found`);
  
  return definition;
};

/**
 * Replace all $ref and allOf/anyOf/oneOf lists containing $ref with those
 * referred to definitions.
 * 
 * @param {object} propertySchema - Single property schema.
 * @param {*} schema - Top-level schema containing definitions.
 * @returns {void}
 */
const replaceRefs = (propertySchema, schema) => {
  const { $ref, items } = propertySchema;

  // Handle single $ref object
  if ($ref) return resolveRef(schema, $ref);

  // Handle arrays
  if (items && items.$ref) {
    propertySchema.items = resolveRef(schema, items.$ref);
    return propertySchema;
  }

  // Handle lists of objects
  const updated = { ...propertySchema };
  multiSchemaTypes
    .filter(p => propertySchema[p])
    .forEach((listType) => {
      propertySchema[listType].forEach((item, i) => {
        if (!item.$ref) return;

        // Replace list item with definition
        updated[listType][i] = resolveRef(schema, item.$ref);
      });
    });
  return updated;
};

/**
 * Attempt to infer a schema type from other present fields.
 * 
 * @param {object} schema - Schema to examine.
 * @returns {string} Attempted inferred type.
 */
const inferType = (level, schema) => {
  if (schema.minItems || schema.maxItems) {
    console.log(`${pad(level)}! Inferred type 'array'`);
    return 'array';
  }

  console.log(`${pad(level)}! Inferred type 'object'`);
  return 'object';
};

module.exports = {
  multiSchemaTypes,
  readJsonFile,
  pad,
  validateFragment,
  resolveRef,
  replaceRefs,
  inferType,
};
