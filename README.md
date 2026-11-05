# Hello Robo

A full-screen robot worksite with floating map-style controls, built with Three.js. No real robot connection or backend is used.

## Run

```sh
python3 -m http.server 5173 --directory dist
```

Open http://localhost:5173. No dependency installation or build step is required.

## Published site

[Open Hello Robo](https://vladduhnov.github.io/Robot-controls/)

Every push to `main` runs the camera and simulation tests, then deploys `dist/` to GitHub Pages. The deployment workflow is in `.github/workflows/pages.yml`.

GitHub Pages hosts the simulation only; it does not connect to a physical robot.

## Controls

- **Click to guide:** click the robot, then the floor to move or a station to work. The robot starts selected.
- **Queue:** every destination or station click appends to the plan, in click order. Shift-click works as well; no switch is needed. Clear the queue to start a new plan.
- **Pickup → assembly:** click the box or the Pickup label on the worksite, then Shift-click Assembly. The robot navigates around furniture, picks up the box, carries it to the bench and assembles an item.
- **Joystick:** drag in the direction you want the robot to move on screen. Release to stop. WASD and arrow keys also work. Pick up within 0.9 m of the box. Put down near the bench to assemble; elsewhere, drop onto clear floor.
- **Pause/resume, remove, clear:** manage tasks in the queue. Removing a pickup also removes any assembly that depends on it.
- **Escape:** cancels tasks and movement immediately.
- **Reset:** restores the room, cargo and robot.
- **Camera:** third-person uses a perspective camera behind the robot and follows its position and heading. Drag the worksite to look around; Recenter returns behind the robot. Top-down remains a fixed overhead map. Offscreen station markers stay at the screen edges. All four sides of the room have 3.2 m walls that fade when they obstruct the camera’s view of Chappie and become solid again when the view clears.

Switching to joystick pauses an existing plan. Resume it with the queue play button. Manual movement invalidates the old path, so resuming calculates a route from the new position.

## Verification

```sh
node --test tests/*.test.mjs
```

Covers perspective camera framing, heading changes, camera-relative input, orbit behavior, ordered task execution, obstacle navigation, pause/stop, task replacement, assembly preconditions, joystick collisions/release, manual pickup/drop/assembly, and replanning after manual overrides.

## Files

- `dist/app.js`: Three.js scene, UI bindings, pointer and keyboard input.
- `dist/camera-rig.js`: perspective follow camera and camera-relative movement.
- `dist/simulation.js`: collision grid, A* navigation and task execution.
- `dist/style.css`: responsive desktop/tablet/mobile layout and reduced-motion handling.
- `dist/vendor/three.module.js`: Three.js 0.170.0 (MIT; license in `dist/vendor/three.LICENSE.txt`).

The simulation is session-local; reload resets it. The room is a fixed test floor plan. External fonts are optional; system sans-serif is the fallback.
