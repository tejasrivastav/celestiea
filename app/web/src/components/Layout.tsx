import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { Logo } from './Logo';

const departments = [
  { slug: 'women', name: 'Women' },
  { slug: 'men', name: 'Men' },
  { slug: 'kids', name: 'Kids' },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <Link to="/" className="brand-mark" aria-label="celestiea home">
          <Logo />
        </Link>
        <nav aria-label="Departments">
          <ul className="departments">
            {departments.map((department) => (
              <li key={department.slug}>
                <NavLink to={`/c/${department.slug}`}>{department.name}</NavLink>
              </li>
            ))}
            <li>
              <NavLink to="/c/women?onSale=true" className="sale-link">
                Sale
              </NavLink>
            </li>
          </ul>
        </nav>
        <NavLink to="/admin" className="admin-link">
          Admin
        </NavLink>
      </header>
      <main id="main">{children}</main>
      <footer className="site-footer">
        <p>celestiea is a demo catalog. Brands and products are fictional.</p>
      </footer>
    </>
  );
}
