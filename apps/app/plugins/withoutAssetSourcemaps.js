const { withAppBuildGradle } = require("@expo/config-plugins");

const PATTERN_LINE = /ignoreAssetsPattern\s+'([^']*)'/;
const EXCLUDE_MAPS = "!*.map";

/**
 * Android's release bundling emits a sourcemap beside every DOM component
 * bundle, and Expo hands the whole export directory to Gradle as assets — so
 * ~29 MB of `.map` files ship inside the APK, carrying the original module
 * structure with them. iOS never produces them.
 *
 * Excluded at packaging rather than suppressed at generation, so the maps stay
 * on disk for anyone symbolicating a release stack trace.
 */
module.exports = function withoutAssetSourcemaps(config) {
  return withAppBuildGradle(config, (gradleConfig) => {
    const contents = gradleConfig.modResults.contents;
    const match = contents.match(PATTERN_LINE);

    if (!match) {
      throw new Error(
        "withoutAssetSourcemaps: no ignoreAssetsPattern in app/build.gradle. " +
          "The Expo template changed; update this plugin rather than shipping the sourcemaps.",
      );
    }

    if (match[1].split(":").includes(EXCLUDE_MAPS)) {
      return gradleConfig;
    }

    gradleConfig.modResults.contents = contents.replace(
      PATTERN_LINE,
      `ignoreAssetsPattern '${match[1]}:${EXCLUDE_MAPS}'`,
    );
    return gradleConfig;
  });
};
