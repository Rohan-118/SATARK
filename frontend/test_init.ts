import { initializeSimulation } from './src/api/simulationApi';

async function run() {
    try {
        console.log("Initializing...");
        const snap = await initializeSimulation('flood' as any);
        console.log('Valid Snapshot Agents:', snap.agents.agents.length);
    } catch (err) {
        console.error(err);
    }
}
run();
