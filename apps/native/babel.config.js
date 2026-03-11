module.exports = function (api) {
  const env = api.env();
  api.cache.using(() => env);

  if (env === "test") {
    return {
      presets: ["babel-preset-expo"],
    };
  }

  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
