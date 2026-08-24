import React from 'react';
import { CommandCenterLayout } from '../components/layout/CommandCenterLayout';
import { CityScene } from '../components/twin/CityScene';
import { CommandHeader } from '../components/layout/CommandHeader';
import { TimelineBar } from '../components/layout/TimelineBar';
import { LeftPanel } from '../components/workflow/LeftPanel';
import { RightPanel } from '../components/workflow/RightPanel';
import { CompactControls } from '../components/workflow/CompactControls';
import { SimulationLoopManager } from '../components/workflow/SimulationLoopManager';

export const CommandCenter: React.FC = () => {
  return (
    <>
      <SimulationLoopManager />
      <CommandCenterLayout
        header={<CommandHeader />}
        leftSidebar={<LeftPanel />}
        rightSidebar={<RightPanel />}
        main={
          <>
            <CityScene />
            <CompactControls />
          </>
        }
        footer={<TimelineBar />}
      />
    </>
  );
};
