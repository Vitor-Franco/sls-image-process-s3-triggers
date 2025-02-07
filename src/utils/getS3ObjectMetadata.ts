import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "../clients/s3Client";

interface Props {
	bucket: string;
	key: string;
}

export async function getS3ObjectMetadata({ bucket, key }: Props) {
	const headObjectCommand = new HeadObjectCommand({
		Bucket: bucket,
		Key: key,
	});

	const { Metadata = {} } = await s3Client.send(headObjectCommand);

	return Metadata;
}
