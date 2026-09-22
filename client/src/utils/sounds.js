// MT5-style trading sounds utility
// Uses Web Audio API to generate sounds similar to MetaTrader 5

class TradingSounds {
  constructor() {
    this.audioContext = null;
    this.enabled = true;
    this.volume = 0.5;
  }

  initContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume context if suspended (browsers require user interaction)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  // Play a beep sound with customizable frequency and duration
  playTone(frequency, duration, type = 'sine', gainValue = this.volume) {
    if (!this.enabled) return;
    
    try {
      const ctx = this.initContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
      
      // Envelope for smooth sound
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(gainValue, ctx.currentTime + 0.01);
      gainNode.gain.linearRampToValueAtTime(gainValue * 0.7, ctx.currentTime + duration * 0.5);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + duration);
    } catch (error) {
      console.warn('Sound playback failed:', error);
    }
  }

  // Login sound - welcoming chime (ascending notes)
  playLogin() {
    if (!this.enabled) return;
    
    try {
      const ctx = this.initContext();
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 - major chord ascending
      
      notes.forEach((freq, index) => {
        setTimeout(() => {
          this.playTone(freq, 0.15, 'sine', this.volume * 0.6);
        }, index * 100);
      });
    } catch (error) {
      console.warn('Login sound failed:', error);
    }
  }

  // Logout sound - descending notes
  playLogout() {
    if (!this.enabled) return;
    
    try {
      const notes = [783.99, 659.25, 523.25]; // G5, E5, C5 - descending
      
      notes.forEach((freq, index) => {
        setTimeout(() => {
          this.playTone(freq, 0.12, 'sine', this.volume * 0.5);
        }, index * 80);
      });
    } catch (error) {
      console.warn('Logout sound failed:', error);
    }
  }

  // Trade executed sound - MT5 style "tick" sound
  playTradeExecuted() {
    if (!this.enabled) return;
    
    try {
      const ctx = this.initContext();
      
      // First beep - confirmation
      this.playTone(880, 0.08, 'sine', this.volume * 0.7);
      
      // Second beep - slightly higher, quick
      setTimeout(() => {
        this.playTone(1108.73, 0.1, 'sine', this.volume * 0.5);
      }, 80);
    } catch (error) {
      console.warn('Trade executed sound failed:', error);
    }
  }

  // Trade closed sound - MT5 style closing sound
  playTradeClosed() {
    if (!this.enabled) return;

    try {
      // Two-tone descending beep
      this.playTone(987.77, 0.1, 'sine', this.volume * 0.6);

      setTimeout(() => {
        this.playTone(783.99, 0.12, 'sine', this.volume * 0.5);
      }, 100);
    } catch (error) {
      console.warn('Trade closed sound failed:', error);
    }
  }

  // Partial close sound - Fix 19. Slightly softer two-tone descending beep
  // so the user can audibly distinguish a partial close from a full close.
  // Same shape as playTradeClosed but lower volume + shorter durations.
  playPartialClose() {
    if (!this.enabled) return;
    try {
      this.playTone(880, 0.07, 'sine', this.volume * 0.45);
      setTimeout(() => {
        this.playTone(698.46, 0.08, 'sine', this.volume * 0.4);
      }, 70);
    } catch (error) {
      console.warn('Partial close sound failed:', error);
    }
  }

  // SL hit sound - Fix 19. Sharp descending pair to convey "loss / stop fired".
  // Distinct from the standard close sound so the user can tell SL apart from
  // a manual close just by hearing it.
  playSLHit() {
    if (!this.enabled) return;
    try {
      // Sharper square-wave attack + steeper drop
      this.playTone(622.25, 0.12, 'square', this.volume * 0.45); // D#5
      setTimeout(() => {
        this.playTone(415.30, 0.16, 'sine', this.volume * 0.55); // G#4
      }, 110);
    } catch (error) {
      console.warn('SL hit sound failed:', error);
    }
  }

  // TP hit sound - Fix 19. Bright ascending pair to convey "profit / target hit".
  playTPHit() {
    if (!this.enabled) return;
    try {
      // Two ascending sine notes (C5 → E5)
      this.playTone(523.25, 0.1, 'sine', this.volume * 0.55); // C5
      setTimeout(() => {
        this.playTone(659.25, 0.14, 'sine', this.volume * 0.6); // E5
      }, 90);
    } catch (error) {
      console.warn('TP hit sound failed:', error);
    }
  }

  // Error/rejection sound
  playError() {
    if (!this.enabled) return;
    
    try {
      // Low buzzer sound
      this.playTone(220, 0.15, 'square', this.volume * 0.3);
      setTimeout(() => {
        this.playTone(196, 0.2, 'square', this.volume * 0.25);
      }, 150);
    } catch (error) {
      console.warn('Error sound failed:', error);
    }
  }

  // Notification sound - gentle ping
  playNotification() {
    if (!this.enabled) return;
    
    try {
      this.playTone(1318.51, 0.08, 'sine', this.volume * 0.4);
    } catch (error) {
      console.warn('Notification sound failed:', error);
    }
  }

  // Alert sound - attention grabbing
  playAlert() {
    if (!this.enabled) return;
    
    try {
      const notes = [880, 880, 880];
      notes.forEach((freq, index) => {
        setTimeout(() => {
          this.playTone(freq, 0.1, 'sine', this.volume * 0.5);
        }, index * 150);
      });
    } catch (error) {
      console.warn('Alert sound failed:', error);
    }
  }

  // Toggle sounds on/off
  setEnabled(enabled) {
    this.enabled = enabled;
    localStorage.setItem('tradingSoundsEnabled', enabled ? 'true' : 'false');
  }

  // Set volume (0-1)
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    localStorage.setItem('tradingSoundsVolume', this.volume.toString());
  }

  // Load settings from localStorage
  loadSettings() {
    const enabled = localStorage.getItem('tradingSoundsEnabled');
    const volume = localStorage.getItem('tradingSoundsVolume');
    
    if (enabled !== null) {
      this.enabled = enabled === 'true';
    }
    if (volume !== null) {
      this.volume = parseFloat(volume);
    }
  }
}

// Create singleton instance
const tradingSounds = new TradingSounds();
tradingSounds.loadSettings();

export default tradingSounds;
