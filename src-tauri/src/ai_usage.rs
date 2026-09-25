use serde::Serialize;
use sqlx::{Row, SqliteConnection};

/// Provider-reported usage accumulated outside the cancellable network future.
#[derive(Default)]
pub(crate) struct UsageCapture {
    pub input: Option<i64>,
    pub output: Option<i64>,
}

/// Records one accepted request before dispatch, without identifying the paper or its content.
pub(crate) async fn begin(
    db: &mut SqliteConnection,
    id: &str,
    provider: &str,
    model: &str,
) -> Result<(), String> {
    sqlx::query("INSERT INTO ai_usage(request_id,provider,model,status) VALUES (?,?,?,'pending')")
        .bind(id)
        .bind(provider)
        .bind(model)
        .execute(db)
        .await
        .map_err(|_| "无法记录本地用量，请检查数据库后重试".into())
        .map(|_| ())
}

/// Finalizes a request once, preserving unknown usage as NULL, including cancellation/errors.
pub(crate) async fn finish(
    db: &mut SqliteConnection,
    id: &str,
    status: &str,
    usage: &UsageCapture,
) -> Result<(), String> {
    sqlx::query("UPDATE ai_usage SET status=?,finished_at=CURRENT_TIMESTAMP,input_tokens=?,output_tokens=? WHERE request_id=?")
        .bind(status).bind(usage.input).bind(usage.output).bind(id).execute(db).await
        .map_err(|_| "请求已结束，但用量统计保存失败".into()).map(|_| ())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageBucket {
    day: String,
    provider: String,
    model: String,
    requests: i64,
    succeeded: i64,
    failed: i64,
    cancelled: i64,
    pending: i64,
    unknown_usage: i64,
    input_tokens: i64,
    output_tokens: i64,
}

/// Returns local-calendar-day aggregates for a bounded range. Sums cover known values only.
pub(crate) async fn report(
    db: &mut SqliteConnection,
    days: i64,
) -> Result<Vec<UsageBucket>, String> {
    if ![7, 30, 90].contains(&days) {
        return Err("仅支持最近 7、30 或 90 天".into());
    }
    let rows = sqlx::query("SELECT date(started_at,'localtime') AS day,provider,model,COUNT(*) AS requests,
        SUM(status='succeeded') AS succeeded,SUM(status='failed') AS failed,SUM(status='cancelled') AS cancelled,
        SUM(status='pending') AS pending,SUM(input_tokens IS NULL OR output_tokens IS NULL) AS unknown_usage,
        COALESCE(SUM(input_tokens),0) AS input_tokens,COALESCE(SUM(output_tokens),0) AS output_tokens
        FROM ai_usage WHERE started_at >= datetime('now','localtime','start of day',?,'utc')
        AND started_at <= datetime('now') GROUP BY day,provider,model ORDER BY day,provider,model")
        .bind(format!("-{} days", days - 1)).fetch_all(db).await.map_err(|_| "无法读取用量报表")?;
    Ok(rows
        .into_iter()
        .map(|row| UsageBucket {
            day: row.get("day"),
            provider: row.get("provider"),
            model: row.get("model"),
            requests: row.get("requests"),
            succeeded: row.get("succeeded"),
            failed: row.get("failed"),
            cancelled: row.get("cancelled"),
            pending: row.get("pending"),
            unknown_usage: row.get("unknown_usage"),
            input_tokens: row.get("input_tokens"),
            output_tokens: row.get("output_tokens"),
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::Connection;
    #[tokio::test]
    async fn aggregates_failures_cancellation_and_null_usage_without_double_counting() {
        let mut db = SqliteConnection::connect("sqlite::memory:").await.unwrap();
        sqlx::raw_sql(include_str!("../migrations/0004_ai_usage.sql"))
            .execute(&mut db)
            .await
            .unwrap();
        begin(&mut db, "a", "DeepSeek", "model-a").await.unwrap();
        assert!(begin(&mut db, "a", "DeepSeek", "model-a").await.is_err());
        finish(
            &mut db,
            "a",
            "succeeded",
            &UsageCapture {
                input: Some(100),
                output: Some(20),
            },
        )
        .await
        .unwrap();
        finish(
            &mut db,
            "a",
            "succeeded",
            &UsageCapture {
                input: Some(100),
                output: Some(20),
            },
        )
        .await
        .unwrap();
        begin(&mut db, "b", "DeepSeek", "model-a").await.unwrap();
        finish(&mut db, "b", "cancelled", &UsageCapture::default())
            .await
            .unwrap();
        begin(&mut db, "c", "DeepSeek", "model-b").await.unwrap();
        finish(
            &mut db,
            "c",
            "failed",
            &UsageCapture {
                input: Some(3),
                output: None,
            },
        )
        .await
        .unwrap();
        begin(&mut db, "old", "DeepSeek", "model-a").await.unwrap();
        sqlx::query(
            "UPDATE ai_usage SET started_at=datetime('now','-100 days') WHERE request_id='old'",
        )
        .execute(&mut db)
        .await
        .unwrap();
        let rows = report(&mut db, 7).await.unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].requests, 2);
        assert_eq!(rows[0].input_tokens, 100);
        assert_eq!(rows[0].unknown_usage, 1);
        assert_eq!(rows[0].cancelled, 1);
        assert_eq!(rows[1].failed, 1);
        assert_eq!(rows[1].output_tokens, 0);
        assert_eq!(rows[1].unknown_usage, 1);
        begin(&mut db, "private", "自定义 OpenAI 兼容", "model-a")
            .await
            .unwrap();
        let rows = report(&mut db, 7).await.unwrap();
        assert_eq!(rows.len(), 3);
        assert_eq!(
            rows.iter()
                .find(|row| row.provider == "自定义 OpenAI 兼容")
                .unwrap()
                .requests,
            1
        );
        assert!(report(&mut db, 0).await.is_err());
    }
}
