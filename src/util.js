const { readFileSync } = require('fs');
const { validate } = require('jsonschema');
const { VERBOSE } = require('./config');

const { DEBUG } = process.env;

/** Multi-schema types */
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
 * Log debug info.
 *
 * @param {string} msg - Message to log.
 */
const debugLog = msg => {
  if (DEBUG !== 'true') return;

  console.log(`${msg}`.grey);
};

/**
 * Validate a schema fragment with an instance fragment.
 * Definitions can be injected for resolution.
 * 
 * @param {object} schema - Schema fragment.
 * @param {object} instance - Instance fragment.
 * @param {object} topLevelSchema - Top level schema including definitions.
 * @returns {string} First error stack.
 */
const validateFragment = (schema, instance, { definitions }) => {
  const { errors } = validate(instance, { ...schema, definitions });
  return errors.length ? errors[0].stack : undefined;
};

/**
 * Get the name of the definition a $ref refers to.
 *
 * @param {string} $ref - Ref to use.
 * @returns {string} Name of the definition.
 */
const getRefName = $ref => $ref.split('/').pop();

/**
 * Resolve a definition from $ref string.
 * 
 * @param {object} schema - Top level schema containing definitions.
 * @param {string} $ref - Ref string.
 * @returns {object} Resolved definition.
 */
const resolveDefinition = (schema, $ref) => {
  const refName = getRefName($ref);
  const definition = schema.definitions && schema.definitions[refName];
  if (!definition) throw new Error(`Definition ${refName} not found`);
  
  return definition;
};

/**
 * Replace all $ref and allOf/anyOf/oneOf lists containing $ref with those
 * referred to definitions.
 * 
 * @param {object} propertySchema - Single property schema.
 * @param {object} schema - Top-level schema containing definitions.
 * @returns {void}
 */
const replaceRefs = (propertySchema, schema) => {
  const { $ref, items } = propertySchema;

  // Handle single $ref object
  if ($ref) return resolveDefinition(schema, $ref);

  // Handle arrays where items are $ref
  if (items && items.$ref) {
    propertySchema.items = resolveDefinition(schema, items.$ref);
    return propertySchema;
  }

  // Handle lists of objects within anyOf, allOf, etc.
  const updatedPropSchema = { ...propertySchema };
  multiSchemaTypes
    .filter(p => propertySchema[p])
    .forEach((listType) => {
      propertySchema[listType].forEach((item, i) => {
        if (!item.$ref) return;

        // Replace list item with definition
        updatedPropSchema[listType][i] = resolveDefinition(schema, item.$ref);
      });
    });
  return updatedPropSchema;
};

/**
 * Attempt to infer a schema type from other present fields.
 * 
 * @param {object} schema - Schema to examine.
 * @returns {string} Attempted inferred type.
 */
const inferType = (level, schema) => {
  if (schema.minItems || schema.maxItems) {
    if (VERBOSE) console.log(`${pad(level)}! Inferred type 'array'`);
    return 'array';
  }

  if (VERBOSE) console.log(`${pad(level)}! Inferred type 'object'`);
  return 'object';
};

module.exports = {
  multiSchemaTypes,
  readJsonFile,
  pad,
  debugLog,
  validateFragment,
  resolveDefinition,
  getRefName,
  replaceRefs,
  inferType,
};
