import { useEffect, useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import TabBar from './components/TabBar.tsx';
import { initDb } from './db/init.ts';
import { activeProfileId } from './lib/profiles.ts';
import Home from './routes/Home.tsx';
import ProfileNew from './routes/ProfileNew.tsx';
import Workout from './routes/Workout.tsx';
import Progress from './routes/Progress.tsx';
import Settings from './routes/Settings.tsx';
import Summary from './routes/Summary.tsx';

const CREATE = '/profile/new';

export default function App() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [opened, setOpened] = useState(false);

  // База открывается один раз за запуск: там же отрабатывает миграция.
  useEffect(() => { void initDb().then(() => setOpened(true)); }, []);

  // Дневник без профиля не показать: некому он принадлежит. Проверяем на
  // каждом переходе — профиль можно и удалить из настроек.
  useEffect(() => {
    if (!opened || pathname === CREATE) return;
    void activeProfileId().then((id) => {
      if (!id) navigate(CREATE, { replace: true });
    });
  }, [opened, pathname, navigate]);

  // На экране занятия, в итоге и в анкете таббар только мешает
  // и ловит случайные нажатия.
  const hideTabs = pathname.startsWith('/workout')
    || pathname.startsWith('/summary')
    || pathname.startsWith('/profile');

  if (!opened) {
    return (
      <div className="app">
        <main className="screen"><div style={{ padding: '0 var(--pad)' }} className="label">ЗАГРУЗКА</div></main>
      </div>
    );
  }

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path={CREATE} element={<ProfileNew />} />
        <Route path="/workout" element={<Workout />} />
        <Route path="/summary/:id" element={<Summary />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Home />} />
      </Routes>
      {!hideTabs && <TabBar />}
    </div>
  );
}
