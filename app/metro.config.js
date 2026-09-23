// Metro configuration.
//
// Two jobs beyond the Expo defaults:
//  1. Let the app import the shared domain package that lives outside app/.
//  2. Resolve PowerSync to its web build on web and its native build elsewhere
//     (see https://docs.powersync.com/client-sdks/frameworks/react-native-web-support).

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// 1. Shared domain package ---------------------------------------------------
config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 2. PowerSync web / native split --------------------------------------------
config.resolver.unstable_conditionsByPlatform = config.resolver.unstable_conditionsByPlatform ?? {};
config.resolver.unstable_conditionsByPlatform.web = [
  ...(config.resolver.unstable_conditionsByPlatform.web ?? []),
  'react-native-web',
];

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    if (['react-native-prompt-android', '@powersync/react-native', '@op-engineering/op-sqlite'].includes(moduleName)) {
      return { type: 'empty' };
    }
    if (moduleName === 'react-native') {
      return context.resolveRequest(context, 'react-native-web', platform);
    }
  } else if (['@powersync/web', '@journeyapps/wa-sqlite'].includes(moduleName)) {
    return { type: 'empty' };
  }

  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
