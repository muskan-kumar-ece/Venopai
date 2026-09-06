export const FileList = ({ files }: { files?: any[] }) => <ul>{files?.map((f, i) => <li key={i}>{f.name}</li>)}</ul>;
