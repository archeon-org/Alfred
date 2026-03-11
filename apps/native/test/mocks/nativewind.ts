let colorScheme: "light" | "dark" = "light";

export const __setColorScheme = (next: "light" | "dark") => {
  colorScheme = next;
};

export const useColorScheme = () => ({
  colorScheme,
  setColorScheme: (next: "light" | "dark") => {
    colorScheme = next;
  },
});
