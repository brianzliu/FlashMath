use chrono::{NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};

const MIN_EASE: f64 = 1.3;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SrsCard {
    pub ease_factor: f64,
    pub interval_days: f64,
    pub repetitions: i32,
    pub due_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewInput {
    pub correct: bool,
    pub response_time_seconds: f64,
    pub timer_limit_seconds: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SrsResult {
    pub ease_factor: f64,
    pub interval_days: f64,
    pub repetitions: i32,
    pub due_date: String,
    pub quality: i32,
    pub speed_ratio: f64,
}

pub fn calculate_srs(card: &SrsCard, review: &ReviewInput, deadline: Option<&str>) -> SrsResult {
    let speed_ratio = if review.timer_limit_seconds > 0.0 {
        review.response_time_seconds / review.timer_limit_seconds
    } else {
        1.0
    };

    let mut ease_factor = card.ease_factor;
    let mut interval_days: f64;
    let mut repetitions = card.repetitions;
    let quality: i32;

    if !review.correct {
        // Incorrect answer
        quality = 0;
        ease_factor = (ease_factor - 0.20).max(MIN_EASE);
        repetitions = 0;
        interval_days = 1.0;
    } else if speed_ratio <= 0.6 {
        // Correct + Fast
        quality = 5;
        ease_factor += 0.15;
        repetitions += 1;
        interval_days = next_interval(repetitions, card.interval_days, ease_factor, 1.3);
    } else if speed_ratio <= 1.0 {
        // Correct + Normal
        quality = 4;
        ease_factor += 0.05;
        repetitions += 1;
        interval_days = next_interval(repetitions, card.interval_days, ease_factor, 1.0);
    } else {
        // Correct + Slow (over time limit)
        quality = 3;
        ease_factor = (ease_factor - 0.10).max(MIN_EASE);
        repetitions += 1;
        interval_days = next_interval(repetitions, card.interval_days, ease_factor, 0.8);
    }

    // Enforce ease floor
    ease_factor = ease_factor.max(MIN_EASE);

    // Apply deadline compression if applicable
    if let Some(deadline_str) = deadline {
        if let Ok(deadline_date) = NaiveDateTime::parse_from_str(
            &format!("{} 00:00:00", deadline_str),
            "%Y-%m-%d %H:%M:%S",
        ) {
            let now = Utc::now().naive_utc();
            let days_remaining = (deadline_date - now).num_days() as f64;

            if days_remaining > 0.0 {
                // Estimate reviews still needed: new cards need ~5 reviews to mature
                let reviews_still_needed = (6 - repetitions).max(1) as f64;
                let max_interval = days_remaining / reviews_still_needed;
                interval_days = interval_days.min(max_interval).max(1.0);
            }
        }
    }

    // Calculate next due date
    let now = Utc::now();
    let due = now + chrono::Duration::days(interval_days.round() as i64);
    let due_date = due.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();

    SrsResult {
        ease_factor,
        interval_days,
        repetitions,
        due_date,
        quality,
        speed_ratio,
    }
}

fn next_interval(reps: i32, prev_interval: f64, ease: f64, speed_multiplier: f64) -> f64 {
    match reps {
        r if r <= 1 => 1.0,
        2 => 3.0,
        _ => (prev_interval * ease * speed_multiplier).max(1.0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_incorrect_resets() {
        let card = SrsCard {
            ease_factor: 2.5,
            interval_days: 10.0,
            repetitions: 3,
            due_date: None,
        };
        let review = ReviewInput {
            correct: false,
            response_time_seconds: 30.0,
            timer_limit_seconds: 60.0,
        };
        let result = calculate_srs(&card, &review, None);
        assert_eq!(result.repetitions, 0);
        assert_eq!(result.interval_days, 1.0);
        assert_eq!(result.quality, 0);
        assert!((result.ease_factor - 2.3).abs() < 0.001);
    }

    #[test]
    fn test_correct_fast() {
        let card = SrsCard {
            ease_factor: 2.5,
            interval_days: 0.0,
            repetitions: 0,
            due_date: None,
        };
        let review = ReviewInput {
            correct: true,
            response_time_seconds: 20.0,
            timer_limit_seconds: 60.0,
        };
        let result = calculate_srs(&card, &review, None);
        assert_eq!(result.repetitions, 1);
        assert_eq!(result.interval_days, 1.0);
        assert_eq!(result.quality, 5);
        assert!((result.ease_factor - 2.65).abs() < 0.001);
    }

    #[test]
    fn test_correct_normal() {
        let card = SrsCard {
            ease_factor: 2.5,
            interval_days: 3.0,
            repetitions: 2,
            due_date: None,
        };
        let review = ReviewInput {
            correct: true,
            response_time_seconds: 45.0,
            timer_limit_seconds: 60.0,
        };
        let result = calculate_srs(&card, &review, None);
        assert_eq!(result.repetitions, 3);
        assert!((result.interval_days - 7.65).abs() < 0.1); // 3 * 2.55 * 1.0 (ease 2.5 + 0.05)
        assert_eq!(result.quality, 4);
    }

    #[test]
    fn test_correct_slow() {
        let card = SrsCard {
            ease_factor: 2.5,
            interval_days: 3.0,
            repetitions: 2,
            due_date: None,
        };
        let review = ReviewInput {
            correct: true,
            response_time_seconds: 90.0,
            timer_limit_seconds: 60.0,
        };
        let result = calculate_srs(&card, &review, None);
        assert_eq!(result.quality, 3);
        assert!((result.ease_factor - 2.4).abs() < 0.001);
    }

    #[test]
    fn test_ease_floor() {
        let card = SrsCard {
            ease_factor: 1.3,
            interval_days: 1.0,
            repetitions: 0,
            due_date: None,
        };
        let review = ReviewInput {
            correct: false,
            response_time_seconds: 30.0,
            timer_limit_seconds: 60.0,
        };
        let result = calculate_srs(&card, &review, None);
        assert!((result.ease_factor - MIN_EASE).abs() < 0.001);
    }

    #[test]
    fn test_deadline_compression() {
        let card = SrsCard {
            ease_factor: 2.5,
            interval_days: 10.0,
            repetitions: 3,
            due_date: None,
        };
        let review = ReviewInput {
            correct: true,
            response_time_seconds: 30.0,
            timer_limit_seconds: 60.0,
        };
        // Deadline 5 days from now
        let deadline = (Utc::now() + chrono::Duration::days(5))
            .format("%Y-%m-%d")
            .to_string();
        let result = calculate_srs(&card, &review, Some(&deadline));
        // With 3 reps done, reviews_still_needed = max(6-4, 1) = 2
        // max_interval = ~5/2 = 2.5
        // Normal interval would be much larger, so it should be capped
        assert!(result.interval_days <= 3.0);
    }
}
