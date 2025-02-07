import type { S3Event } from "aws-lambda";
import { randomUUID } from "node:crypto";
import { sendSQSBatchMessage } from "../../utils/sendSQSBatchMessage";
import { env } from "../../config/env";

export async function handler(event: S3Event) {
	const BATCH_LIMIT_SQS = 10;
	let batchChunks = [];

	for (const record of event.Records) {
		const { bucket, object } = record.s3;

		const s3RecordPayload = {
			Id: randomUUID(),
			MessageBody: JSON.stringify({
				bucket: bucket.name,
				key: object.key,
			}),
		};

		if (batchChunks.length === BATCH_LIMIT_SQS) {
			await sendSQSBatchMessage({
				queueUrl: env.IMAGE_PROCESSING_QUEUE_URL,
				entries: batchChunks,
			});
			batchChunks = [];
		}

		batchChunks.push(s3RecordPayload);
	}

	if (batchChunks.length > 0) {
		// when there are records to process but less than 10
		await sendSQSBatchMessage({
			queueUrl: env.IMAGE_PROCESSING_QUEUE_URL,
			entries: batchChunks,
		});
	}
}
