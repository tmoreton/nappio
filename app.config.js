module.exports = ({ config }) => {
  const webBaseUrl = process.env.EXPO_WEB_BASE_URL?.trim();
  const owner = process.env.NAPPIO_EXPO_OWNER?.trim();
  const slug = process.env.NAPPIO_EXPO_SLUG?.trim();
  const easProjectId = process.env.NAPPIO_EAS_PROJECT_ID?.trim();
  const iosBundleIdentifier = process.env.NAPPIO_IOS_BUNDLE_IDENTIFIER?.trim();
  const androidPackage = process.env.NAPPIO_ANDROID_PACKAGE?.trim();

  return {
    ...config,
    ...(owner ? { owner } : {}),
    ...(slug ? { slug } : {}),
    ios: {
      ...config.ios,
      ...(iosBundleIdentifier ? { bundleIdentifier: iosBundleIdentifier } : {}),
    },
    android: {
      ...config.android,
      ...(androidPackage ? { package: androidPackage } : {}),
    },
    extra: {
      ...config.extra,
      eas: {
        ...config.extra?.eas,
        ...(easProjectId ? { projectId: easProjectId } : {}),
      },
    },
    updates: {
      ...config.updates,
      ...(easProjectId ? { url: `https://u.expo.dev/${easProjectId}` } : {}),
    },
    experiments: {
      ...config.experiments,
      ...(webBaseUrl ? { baseUrl: webBaseUrl } : {}),
    },
  };
};
