module.exports = ({ config }) => {
  const webBaseUrl = process.env.EXPO_WEB_BASE_URL?.trim();

  if (!webBaseUrl) {
    return config;
  }

  return {
    ...config,
    experiments: {
      ...config.experiments,
      baseUrl: webBaseUrl,
    },
  };
};
