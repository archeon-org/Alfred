(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const originalConsoleError = console.error.bind(console);

beforeAll(() => {
  jest.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("react-test-renderer is deprecated")
    ) {
      return;
    }
    originalConsoleError(...(args as any));
  });
});

afterAll(() => {
  (console.error as jest.Mock).mockRestore();
});

const TestRenderer = require("react-test-renderer");
const originalCreate = TestRenderer.create.bind(TestRenderer);

TestRenderer.create = (...args: any[]) => {
  let renderer: any;
  TestRenderer.act(() => {
    renderer = originalCreate(...args);
  });
  return renderer;
};

if (!(global as any).requestAnimationFrame) {
  (global as any).requestAnimationFrame = (callback: (time: number) => void) =>
    setTimeout(() => callback(Date.now()), 0);
}

if (!(global as any).cancelAnimationFrame) {
  (global as any).cancelAnimationFrame = (id: ReturnType<typeof setTimeout>) =>
    clearTimeout(id);
}
