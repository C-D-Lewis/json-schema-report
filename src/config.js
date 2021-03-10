const args = process.argv.slice(2);

const config = {
  SHOW_INFERRED_TYPES: args.includes('-i'),
  SHOW_ONLY_ERRORS: args.includes('-e'),
};

module.exports = config;
