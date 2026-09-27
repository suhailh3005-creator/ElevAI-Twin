// Frame-rate independent, bounded tween. Retarget from the current rendered state.
export const motionDuration=720;
export function easeMotion(progress:number){const t=Math.max(0,Math.min(1,progress));return t*t*t*(t*(t*6-15)+10);}
export function tweenValue(from:number,to:number,progress:number){if(progress>=1)return to;if(progress<=0)return from;return from+(to-from)*easeMotion(progress);}
