// Circuito externo de la Fase 1: LED en serie con una resistencia, entre un pin digital y GND.
// Cálculo eléctrico sencillo (ley de Ohm) para mostrar corriente y brillo.

export const LED_VF = 2.0;          // tensión directa típica de un LED rojo (V)
export const R_SERIE = 220;         // resistencia limitadora (Ω)
export const R_SALIDA = 25;         // resistencia interna aproximada de una salida del ATmega328P (Ω)
export const R_PULLUP = 35000;      // resistencia pull-up interna (entre 20 kΩ y 50 kΩ según el fabricante)
export const I_NOMINAL = 15;        // corriente con la que consideramos el brillo «completo» (mA)

export class LedCircuit {
  constructor(pin = 13) {
    this.pin = pin;
  }

  /**
   * @param {{drive:string, volts:number|null}} el  estado eléctrico del pin
   * @returns {{mA:number, brightness:number, state:'on'|'dim'|'off', volts:number}}
   */
  solve(el) {
    let mA = 0;
    if (el.drive === 'high') mA = ((5 - LED_VF) / (R_SERIE + R_SALIDA)) * 1000;
    else if (el.drive === 'pullup') mA = ((5 - 1.7) / (R_PULLUP + R_SERIE)) * 1000; // a tan poca corriente la Vf baja
    const brightness = Math.min(1, mA / I_NOMINAL);
    const state = mA > 1 ? 'on' : mA > 0.01 ? 'dim' : 'off';
    return { mA, brightness, state, volts: el.volts ?? 0 };
  }
}
