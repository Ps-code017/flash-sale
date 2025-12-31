import http from 'k6/http';
import { check} from 'k6';

export let options = {
    vus: 26,
    duration: '10s',
};

const ports=[3000,3001,3002];
export default function () {
    const userId = Math.floor(Math.random() * 100);

    const payload=JSON.stringify({userId:userId});

    const headers={ 'Content-Type': 'application/json' };

    const portno=ports[Math.floor(Math.random()*ports.length)];

    const res = http.post(`http://host.docker.internal:${portno}/tickets/buy`, payload, { headers: headers });

    check(res, {
        'is status 200': (r) => r.status === 200 || r.status === 400,
    });
}