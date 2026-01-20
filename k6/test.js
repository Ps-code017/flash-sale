import http from 'k6/http';
import { check} from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export let options = {
    vus: 26,
    duration: '10s',
};

const ports=[3000,3001,3002];
export default function () {
    // const userId = Math.floor(Math.random() * 100000);
    const userId = uuidv4();


    const payload=JSON.stringify({userId:userId});

    const headers={ 'Content-Type': 'application/json' };

    const portno=ports[Math.floor(Math.random()*ports.length)];

    const res = http.post(`http://host.docker.internal:${portno}/tickets/buy`, payload, { headers: headers });

    check(res, {
        'is status 200 (Bought)': (r) => r.status === 200,
        'is status 400 (Sold Out/Duplicate)': (r) => r.status === 400,
        'is status 500 (Crash)': (r) => r.status === 500,
    });
}