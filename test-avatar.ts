import { createAvatar } from '@dicebear/core';
import { bottts } from '@dicebear/collection';

console.log(createAvatar(bottts, { seed: 'hello' }).toDataUri());
