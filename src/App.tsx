import { Route, Routes, useLocation } from 'react-router-dom';
import TabBar from './components/TabBar.tsx';
import Home from './routes/Home.tsx';
import Workout from './routes/Workout.tsx';
import Progress from './routes/Progress.tsx';
import Settings from './routes/Settings.tsx';
import Summary from './routes/Summary.tsx';

export default function App() {
  const { pathname } = useLocation();
  // На экране занятия и в итоге таббар только мешает и ловит случайные нажатия.
  const hideTabs = pathname.startsWith('/workout') || pathname.startsWith('/summary');

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Home />} />
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
