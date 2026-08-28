import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/',         label: 'ГЛАВНАЯ' },
  { to: '/workout',  label: 'ЗАНЯТИЕ' },
  { to: '/progress', label: 'ПРОГРЕСС' },
  { to: '/settings', label: 'НАСТРОЙКИ' },
];

export default function TabBar() {
  return (
    <nav className="tabbar">
      {TABS.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) => 'tabbar__item' + (isActive ? ' is-active' : '')}
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
