import { Link, Route, Routes } from 'react-router-dom';
import { backend } from './data';
import { CreatePage } from './pages/CreatePage';
import { RemovePage, SignupPage } from './pages/SignupPage';
import { CoordinatorPage } from './pages/CoordinatorPage';

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
          <span className="badge" title="Data stays in this browser. AI is simulated with simple rules.">
            Demo mode: data stays on this device
          </span>
        )}
      </header>
      <main id="main" className="wrap">
        <Routes>
          <Route path="/" element={<CreatePage />} />
          <Route path="/e/:slug" element={<SignupPage />} />
          <Route path="/e/:slug/remove" element={<RemovePage />} />
          <Route path="/c/:slug" element={<CoordinatorPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </>
  );
}
