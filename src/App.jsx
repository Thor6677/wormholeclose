import { useState } from 'react';
import { generatePlan } from './rollingEngine.js';
import WormholeSelect from './components/WormholeSelect.jsx';
import FleetSetup from './components/FleetSetup.jsx';
import RollingPlan from './components/RollingPlan.jsx';
import ExecutionMode from './components/ExecutionMode.jsx';

export default function App() {
  const [screen, setScreen]           = useState('wormhole-select');
  const [wormhole, setWormhole]       = useState(null);
  const [fleet, setFleet]             = useState([]);
  const [goal, setGoal]               = useState('close');
  const [plan, setPlan]               = useState(null);
  const [activeItems, setActiveItems] = useState([]);

  function handleWormholeSelect(wh) {
    setWormhole(wh);
    setFleet([]);
    setPlan(null);
    setScreen('fleet-setup');
  }

  function handleGeneratePlan() {
    setPlan(generatePlan(wormhole, fleet, goal));
    setScreen('rolling-plan');
  }

  function handleStartRoll(items) {
    setActiveItems(items);
    setScreen('execution');
  }

  function handleReset() {
    setWormhole(null);
    setFleet([]);
    setPlan(null);
    setActiveItems([]);
    setGoal('close');
    setScreen('wormhole-select');
  }

  if (screen === 'wormhole-select') {
    return <WormholeSelect onSelect={handleWormholeSelect} />;
  }

  if (screen === 'fleet-setup') {
    return (
      <FleetSetup
        wormhole={wormhole}
        fleet={fleet}
        setFleet={setFleet}
        goal={goal}
        onGoalChange={setGoal}
        onGenerate={handleGeneratePlan}
        onBack={() => setScreen('wormhole-select')}
      />
    );
  }

  if (screen === 'rolling-plan') {
    return (
      <RollingPlan
        wormhole={wormhole}
        plan={plan}
        fleet={fleet}
        onStart={handleStartRoll}
        onBack={() => setScreen('fleet-setup')}
      />
    );
  }

  if (screen === 'execution') {
    return (
      <ExecutionMode
        wormhole={wormhole}
        fleet={fleet}
        initialItems={activeItems}
        goal={plan?.goal ?? 'close'}
        doorstopShip={plan?.doorstopShip ?? null}
        onReset={handleReset}
      />
    );
  }

  return null;
}
