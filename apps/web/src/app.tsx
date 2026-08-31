const layers = [
  {
    foundation: 'React workspace',
    title: 'Interface',
    description: 'Workspace React/Vite pour piloter les runs, agents, skills et revues.',
  },
  {
    foundation: 'NestJS API',
    title: 'API',
    description: "Backend NestJS type pour l'orchestration produit et les contrats HTTP.",
  },
  {
    foundation: 'LangGraph runtime',
    title: 'Agents',
    description: 'Application LangGraph dediee aux graphes, sous-agents et workflows agentiques.',
  },
];

const checks = ['Docker-ready', 'PostgreSQL-ready', 'ESLint + Prettier', 'CI-ready'];

export function App() {
  return (
    <main className="shell">
      <section className="workspace-panel" aria-labelledby="app-title">
        <p className="eyebrow">Alfred platform scaffold</p>
        <h1 id="app-title">Alfred</h1>
        <p className="lead">
          An approachable workspace for orchestrating AI agents, built on three explicit platform
          boundaries.
        </p>

        <section className="foundations" aria-labelledby="workspace-title">
          <h2 id="workspace-title">Agent workspace</h2>
          <ul className="layer-grid" aria-label="Platform foundations">
            {layers.map((layer) => (
              <li className="layer-card" key={layer.title}>
                <span className="foundation-name">{layer.foundation}</span>
                <h2>{layer.title}</h2>
                <p>{layer.description}</p>
              </li>
            ))}
          </ul>
        </section>

        <div className="status-strip" aria-label="Quality gates">
          {checks.map((check) => (
            <span key={check}>{check}</span>
          ))}
          <span>Secrets via env</span>
        </div>
      </section>
    </main>
  );
}
