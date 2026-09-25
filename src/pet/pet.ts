import { classifyPointerGesture, isPetHit, type Point } from '../shared/pet.js';

declare global {
  interface Window {
    pet: {
      dragStart(offset:Point):void;
      dragEnd():void;
      activate():void;
    };
  }
}

let press:{ start:Point; dragging:boolean } | null = null;

function releasePointer(dragging:boolean){
  press = null;
  document.documentElement.classList.remove('dragging');
  if (dragging) window.pet.dragEnd();
}

window.addEventListener('pointerdown', event => {
  if (event.button !== 0 || press) return;
  // The main process decides when the window is interactive, but a press that lands on the
  // transparent margin is never a pet press, so a click can never open the settings window.
  if (!isPetHit(event.clientX, event.clientY, innerWidth, innerHeight)) return;
  press = { start:{ x:event.clientX, y:event.clientY }, dragging:false };
  // Capture keeps the release on this window even if the pointer is let go outside it.
  if (event.target instanceof Element && event.target.setPointerCapture) event.target.setPointerCapture(event.pointerId);
});

window.addEventListener('pointermove', event => {
  const point = { x:event.clientX, y:event.clientY };
  if (press && !press.dragging && classifyPointerGesture(press.start, point) === 'drag') {
    press.dragging = true;
    document.documentElement.classList.add('dragging');
    // The offset is read where the gesture became a move, so the character does not jump.
    window.pet.dragStart(point);
  }
});

window.addEventListener('pointerup', event => {
  const current = press;
  if (!current) return;
  const point = { x:event.clientX, y:event.clientY };
  const gesture = classifyPointerGesture(current.start, point);
  releasePointer(current.dragging);
  if (current.dragging || gesture === 'drag') return;
  window.pet.activate();
});

// A lost pointer must end the move as well, otherwise the pet would keep following the cursor.
window.addEventListener('pointercancel', () => releasePointer(press?.dragging ?? false));
window.addEventListener('lostpointercapture', () => releasePointer(press?.dragging ?? false));
window.addEventListener('blur', () => releasePointer(press?.dragging ?? false));
window.addEventListener('contextmenu', event => event.preventDefault());
