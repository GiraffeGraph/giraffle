// The crypto polyfill has to be installed before any module that reaches for
// randomness is evaluated, which the router's own entry would otherwise do.
import "./src/platform/installCrypto";

import "expo-router/entry";
