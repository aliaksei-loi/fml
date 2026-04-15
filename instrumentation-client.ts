import {
  setDebug,
  mountBackButton,
  restoreInitData,
  init as initSDK,
  mountMiniAppSync,
  bindThemeParamsCssVars,
  mountViewport,
  bindViewportCssVars,
  type ThemeParams,
  themeParamsState,
  retrieveLaunchParams,
  mockTelegramEnv,
  isTMA,
  emitEvent,
} from "@telegram-apps/sdk-react";

export async function mockEnv(): Promise<void> {
  return process.env.NODE_ENV !== "development"
    ? undefined
    : isTMA("complete").then((isTma) => {
        if (!isTma) {
          const themeParams = {
            accent_text_color: "#6ab2f2",
            bg_color: "#17212b",
            button_color: "#5288c1",
            button_text_color: "#ffffff",
            destructive_text_color: "#ec3942",
            header_bg_color: "#17212b",
            hint_color: "#708499",
            link_color: "#6ab3f3",
            secondary_bg_color: "#232e3c",
            section_bg_color: "#17212b",
            section_header_text_color: "#6ab3f3",
            subtitle_text_color: "#708499",
            text_color: "#f5f5f5",
          } as const;
          const noInsets = { left: 0, top: 0, bottom: 0, right: 0 } as const;

          mockTelegramEnv({
            onEvent(e) {
              // Here you can write your own handlers for all known Telegram Mini Apps methods.
              if (e[0] === "web_app_request_theme") {
                return emitEvent("theme_changed", {
                  theme_params: themeParams,
                });
              }
              if (e[0] === "web_app_request_viewport") {
                return emitEvent("viewport_changed", {
                  height: window.innerHeight,
                  width: window.innerWidth,
                  is_expanded: true,
                  is_state_stable: true,
                });
              }
              if (e[0] === "web_app_request_content_safe_area") {
                return emitEvent("content_safe_area_changed", noInsets);
              }
              if (e[0] === "web_app_request_safe_area") {
                return emitEvent("safe_area_changed", noInsets);
              }
            },
            launchParams: new URLSearchParams([
              ["tgWebAppThemeParams", JSON.stringify(themeParams)],
              [
                "tgWebAppData",
                new URLSearchParams([
                  ["auth_date", ((new Date().getTime() / 1000) | 0).toString()],
                  ["hash", "some-hash"],
                  ["signature", "some-signature"],
                  ["user", JSON.stringify({ id: 1, first_name: "Vladislav" })],
                ]).toString(),
              ],
              ["tgWebAppVersion", "8.4"],
              ["tgWebAppPlatform", "tdesktop"],
            ]),
          });

          console.info(
            "⚠️ As long as the current environment was not considered as the Telegram-based one, it was mocked. Take a note, that you should not do it in production and current behavior is only specific to the development process. Environment mocking is also applied only in development mode. So, after building the application, you will not see this behavior and related warning, leading to crashing the application outside Telegram."
          );
        }
      });
}

export async function init(options: {
  debug: boolean;
  eruda: boolean;
  mockForMacOS: boolean;
}): Promise<void> {
  // Set @telegram-apps/sdk-react debug mode and initialize it.
  setDebug(options.debug);
  initSDK();

  if (options.eruda && process.env.NODE_ENV === "development") {
    void import("eruda").then(({ default: eruda }) => {
      eruda.init();
      eruda.position({ x: window.innerWidth - 50, y: 0 });
    });
  }

  // Telegram for macOS has a ton of bugs, including cases, when the client doesn't
  // even response to the "web_app_request_theme" method. It also generates an incorrect
  // event for the "web_app_request_safe_area" method.
  if (options.mockForMacOS) {
    let firstThemeSent = false;
    mockTelegramEnv({
      onEvent(event, next) {
        if (event[0] === "web_app_request_theme") {
          let tp: ThemeParams = {};
          if (firstThemeSent) {
            tp = themeParamsState();
          } else {
            firstThemeSent = true;
            tp ||= retrieveLaunchParams().tgWebAppThemeParams;
          }
          return emitEvent("theme_changed", { theme_params: tp });
        }

        if (event[0] === "web_app_request_safe_area") {
          return emitEvent("safe_area_changed", {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
          });
        }

        next();
      },
    });
  }

  // Mount all components used in the project.
  mountBackButton.ifAvailable();
  restoreInitData();

  if (mountMiniAppSync.isAvailable()) {
    mountMiniAppSync();
    bindThemeParamsCssVars();
  }

  if (mountViewport.isAvailable()) {
    mountViewport().then(() => {
      bindViewportCssVars();
    });
  }
}

mockEnv().then(() => {
  try {
    const launchParams = retrieveLaunchParams();
    const { tgWebAppPlatform: platform } = launchParams;
    const debug =
      (launchParams.tgWebAppStartParam || "").includes("debug") ||
      process.env.NODE_ENV === "development";

    // Configure all application dependencies.
    init({
      debug,
      eruda: debug && ["ios", "android"].includes(platform),
      mockForMacOS: platform === "macos",
    });
  } catch (e) {
    console.log(e);
  }
});
