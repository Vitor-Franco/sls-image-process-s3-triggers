import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "../clients/s3Client";
import { Readable } from "node:stream";

interface Props {
	bucket: string;
	key: string;
}

export async function getS3Object({ bucket, key }: Props) {
	const getObjectCommand = new GetObjectCommand({
		Bucket: bucket,
		Key: key,
	});

	const { Body, Metadata } = await s3Client.send(getObjectCommand);

	if (!(Body instanceof Readable)) {
		throw new Error(`Cannot find file: ${bucket}/${key}`);
	}

	const chunks = [];
	for await (const chunk of Body) {
		chunks.push(chunk);
	}

	return {
		file: Buffer.concat(chunks),
		metadata: Metadata,
	};
}
