const args = process.argv.slice(2);

const config = {
  SHOW_INFERRED_TYPES: args.includes('-i'),
  SHOW_ONLY_ERRORS: args.includes('-e'),
  SHOW_DECISIONS: args.includes('-d'),
  HIDE_OPTIONAL_VALID: args.includes('-o'),
};

module.exports = config;
