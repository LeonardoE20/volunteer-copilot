import { Link, Route, Routes } from 'react-router-dom';
import { backend } from './data';

function Home() {
  return (
    <section>
      <h1>Volunteer Copilot</h1>
      <p className="muted">Foundation build. The event screens arrive in the rehearsal build.</p>
    </section>
  );
}

function NotFound() {
  return (
    <section>
      <h1>Page not found</h1>
      <p>
        <Link to="/">Go to the start page</Link>
      </p>
    </section>
  );
}

export function App() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="top">
        <Link to="/" className="brand">
          Volunteer Copilot
        </Link>
        {backend.mode === 'local' && (
          <span className="badge" title="Data stays in this browser. AI is simulated.">
            Demo mode
          </span>
        )}
      </header>
      <main id="main" className="wrap">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </>
  );
}
