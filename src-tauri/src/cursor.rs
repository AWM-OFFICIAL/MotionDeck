//! Native global cursor + click sampling.
//!
//! The browser sandbox cannot observe pointer activity outside the app window, so the
//! "smart recording" features (Focus on Click, Follow Cursor, cursor smoothing) depend on
//! this module when running as a desktop app. The frontend degrades to manual focus points
//! when `native_cursor_capture` is reported as unavailable.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use device_query::{DeviceQuery, DeviceState};
use serde::{Deserialize, Serialize};

/// A single sample of pointer state, timestamped from the start of the capture session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorSample {
    /// Milliseconds since capture start.
    pub t: f64,
    pub x: i32,
    pub y: i32,
    /// True on the sample where a press transition was observed.
    pub down: bool,
    /// 1 = left, 2 = right, 3 = middle. Zero when no transition.
    pub button: u8,
}

#[derive(Default)]
pub struct CursorCapture {
    running: Arc<AtomicBool>,
    samples: Arc<Mutex<Vec<CursorSample>>>,
}

impl CursorCapture {
    pub fn new() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            samples: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    /// Starts polling at `hz`. Returns false when a session is already running.
    pub fn start(&self, hz: u32) -> bool {
        if self.running.swap(true, Ordering::SeqCst) {
            return false;
        }
        self.samples.lock().map(|mut s| s.clear()).ok();

        let running = Arc::clone(&self.running);
        let samples = Arc::clone(&self.samples);
        let interval = Duration::from_micros(1_000_000 / hz.clamp(15, 240) as u64);

        thread::spawn(move || {
            let device = DeviceState::new();
            let start = Instant::now();
            let mut prev_buttons = vec![false; 6];

            while running.load(Ordering::SeqCst) {
                let mouse = device.get_mouse();
                let t = start.elapsed().as_secs_f64() * 1000.0;
                let (x, y) = mouse.coords;

                let mut down = false;
                let mut button = 0u8;
                for (idx, pressed) in mouse.button_pressed.iter().enumerate().take(6) {
                    if *pressed && !prev_buttons[idx] {
                        down = true;
                        button = idx as u8;
                    }
                    prev_buttons[idx] = *pressed;
                }

                if let Ok(mut buf) = samples.lock() {
                    // Keep the log compact: only store movement deltas and every click.
                    let should_store = down
                        || buf
                            .last()
                            .map(|last| {
                                (last.x - x).abs() > 1 || (last.y - y).abs() > 1 || t - last.t > 100.0
                            })
                            .unwrap_or(true);
                    if should_store {
                        buf.push(CursorSample { t, x, y, down, button });
                    }
                }

                thread::sleep(interval);
            }
        });

        true
    }

    pub fn stop(&self) -> Vec<CursorSample> {
        self.running.store(false, Ordering::SeqCst);
        thread::sleep(Duration::from_millis(30));
        self.samples
            .lock()
            .map(|mut s| std::mem::take(&mut *s))
            .unwrap_or_default()
    }

    /// Current pointer position, used for live overlays.
    pub fn position() -> (i32, i32) {
        DeviceState::new().get_mouse().coords
    }

    pub fn left_down() -> bool {
        DeviceState::new()
            .get_mouse()
            .button_pressed
            .get(1)
            .copied()
            .unwrap_or(false)
    }
}
