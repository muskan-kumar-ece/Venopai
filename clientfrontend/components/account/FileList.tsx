export const FileList = ({ files }: { files?: Array<{ name: string; id?: string; url?: string }> }) => <ul>{files?.map((f, i) => <li key={i}>{f.name}</li>)}</ul>;
