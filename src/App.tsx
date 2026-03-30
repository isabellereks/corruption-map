import { Header } from './components/Header/Header';
import { ControlsBar } from './components/Controls/ControlsBar';
import { Treemap } from './components/Treemap/Treemap';
import { USMap } from './components/Map/USMap';
import { DetailPanel } from './components/DetailPanel/DetailPanel';
import { useAppContext } from './context/AppContext';

function App() {
  const { colorMode } = useAppContext();

  return (
    <div className="min-h-screen flex flex-col max-w-[1100px] mx-auto">
      <Header />
      <ControlsBar />
      {colorMode === 'map' ? <USMap /> : <Treemap />}
      <DetailPanel />
    </div>
  );
}

export default App;
