import { isMeetingInstruction } from './triplogixMeetingPoint.js';

const hasCoordinates = p => p?.lat !== null && p?.lat !== undefined && p?.lat !== '' &&
    (p?.lng ?? p?.lon) !== null && (p?.lng ?? p?.lon) !== undefined && (p?.lng ?? p?.lon) !== '' &&
    Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng ?? p.lon));

// Modelo de paradas compartidas e individuales. Sin efectos secundarios.
export const getGroupMeetingPoints = (group) => {
    if (group?.pickupMode === 'home' || group?.pickupMode === 'scheduled') return [];
    if (group?.pickupMode === 'meeting') {
        const point = group?.singleMeetingPoint || {};
        return [{ id:'meeting_' + group.id + '_all',active:true,address:String(point.address || '').trim(),lat:point.lat,lng:point.lng ?? point.lon,passengerNames:(group.employees || []).map(e => e.assignedTo) }];
    }
    const modern = Array.isArray(group?.sharedMeetingPoints) ? group.sharedMeetingPoints : [];
    const legacy = group?.sharedMeetingPoint?.active
        ? [{ ...group.sharedMeetingPoint, id: group.sharedMeetingPoint.id || 'legacy-shared' }]
        : [];
    const all = [...modern, ...legacy];
    const seen = new Set();
    return all.filter(point => {
        if (!point?.active) return false;
        const id = String(point.id || `${point.address}|${point.lat}|${point.lng}`);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });
};

export const getEmployeeMeetingPoint = (group, employeeName) => {
    return getGroupMeetingPoints(group).find(point =>
        Array.isArray(point?.passengerNames) &&
        point.passengerNames.includes(employeeName)
    ) || null;
};

export const buildPassengerStopsForGroup = (group) => {
    if (group?.pickupMode === 'scheduled') {
        // Un empleado puede tener Casa el lunes y un punto común el martes.
        // Agrupamos las personas del MISMO punto intermedio en una sola
        // parada, evitando duplicar kilómetros y esperas en Google Directions.
        const stops=[],byMeetingId=new Map();
        for (const employee of group.employees || []) {
            if (!hasCoordinates(employee) || !String(employee.address||'').trim() ||
                isMeetingInstruction(employee.address)) continue;
            if (employee.scheduledPickupType==='meeting' && employee.meetingPointId) {
                const key=String(employee.meetingPointId);
                const existing=byMeetingId.get(key);
                if(existing) existing.employees.push(employee);
                else {
                    const stop={stopType:'shared_meeting',id:'scheduled-'+key,
                        address:employee.address,lat:Number(employee.lat),
                        lng:Number(employee.lng??employee.lon),employees:[employee],
                        meetingPointId:key,meetingPointAlias:employee.meetingPointAlias||''};
                    stops.push(stop);byMeetingId.set(key,stop);
                }
            } else {
                stops.push({stopType:'individual',id:'home-'+employee.assignedTo,
                    address:employee.address,lat:Number(employee.lat),
                    lng:Number(employee.lng??employee.lon),employees:[employee]});
            }
        }
        return stops;
    }
    if (group?.pickupMode === 'meeting') {
        const p = getGroupMeetingPoints(group)[0];
        const lat = Number(p?.lat), lng = Number(p?.lng);
        return p?.address && !isMeetingInstruction(p.address) && hasCoordinates(p) && Number.isFinite(lat) && Number.isFinite(lng)
            ? [{ stopType:'shared_meeting',id:p.id,address:p.address,lat,lng,employees:[...(group.employees || [])] }] : [];
    }
    if (group?.pickupMode === 'home') return (group.employees || []).map(e => {
        // En las cuadrillas automáticas, «Casa» debe recuperar el domicilio
        // original aunque el turno activo esté asignado a un punto medio.
        const useOriginal=group.generatedFromWeeklySchedule===true;
        const address=useOriginal?e.homeAddress:e.address;
        const lat=useOriginal?e.homeLat:e.lat;
        const lng=useOriginal?(e.homeLng??e.homeLon):(e.lng??e.lon);
        return {stopType:'individual',id:'individual-' + e.assignedTo,
            address,lat,lng,employees:[e]};
    }).filter(point=>point.address&&!isMeetingInstruction(point.address)&&hasCoordinates(point))
      .map(point=>({...point,lat:Number(point.lat),lng:Number(point.lng)}));
    const stops = [];
    const usedMeetingPoints = new Set();

    (group?.employees || []).forEach(employee => {
        const aiMeetingKey = String(employee?.aiMeetingPointKey || '').trim();
        if (aiMeetingKey) {
            const key = `ai:${aiMeetingKey}`;
            if (usedMeetingPoints.has(key)) return;
            usedMeetingPoints.add(key);

            const assignedEmployees = (group.employees || []).filter(item =>
                String(item?.aiMeetingPointKey || '').trim() === aiMeetingKey
            );

            stops.push({
                stopType: 'shared_meeting',
                id: key,
                address: employee.address,
                lat: Number(employee.lat),
                lng: Number(employee.lng ?? employee.lon),
                employees: assignedEmployees,
                aiMeetingPoint: true,
                aiMeetingPointLabel: employee?.aiMeetingPointLabel || ''
            });
            return;
        }

        const meetingPoint = getEmployeeMeetingPoint(group, employee.assignedTo);
        if (meetingPoint) {
            const key = String(meetingPoint.id || meetingPoint.address);
            if (usedMeetingPoints.has(key)) return;
            usedMeetingPoints.add(key);

            const assignedEmployees = (group.employees || []).filter(item =>
                Array.isArray(meetingPoint.passengerNames) &&
                meetingPoint.passengerNames.includes(item.assignedTo)
            );

            stops.push({
                stopType: 'shared_meeting',
                id: key,
                address: meetingPoint.address,
                lat: Number(meetingPoint.lat),
                lng: Number(meetingPoint.lng ?? meetingPoint.lon),
                employees: assignedEmployees
            });
            return;
        }

        stops.push({
            stopType: 'individual',
            id: `individual-${employee.assignedTo}`,
            address: employee.address,
            lat: Number(employee.lat),
            lng: Number(employee.lng ?? employee.lon),
            employees: [employee]
        });
    });

    return stops.filter(stop =>
        stop.address &&
        Number.isFinite(stop.lat) &&
        Number.isFinite(stop.lng) &&
        stop.employees.length > 0
    );
};

