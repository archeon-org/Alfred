const inquirer = require("inquirer");
const { execSync } = require("child_process");

const prompt = inquirer.createPromptModule();

prompt([
  {
    name: "project",
    message: "Quel projet souhaitez-vous démarrer ?",
    choices: ["gate", "native", "scribe"],
    default: "native",
    type: "list",
  },
]).then(({ project }) => {
  execSync(`cd ./apps/${project} && npm run start:dev`, {
    stdio: "inherit",
  });
});
