import { isMeetingInstruction } from './triplogixMeetingPoint.js';

// Modelo de paradas compartidas e individuales. Sin efectos secundarios.
export const getGroupMeetingPoints = (group) => {
    if (group?.pickupMode === 'home') return [];
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
    if (group?.pickupMode === 'meeting') {
        const p = getGroupMeetingPoints(group)[0];
        const lat = Number(p?.lat), lng = Number(p?.lng);
        return p?.address && !isMeetingInstruction(p.address) && Number.isFinite(lat) && Number.isFinite(lng)
            ? [{ stopType:'shared_meeting',id:p.id,address:p.address,lat,lng,employees:[...(group.employees || [])] }] : [];
    }
    if (group?.pickupMode === 'home') return (group.employees || []).map(e => ({
        stopType:'individual',id:'individual-' + e.assignedTo,address:e.address,lat:Number(e.lat),lng:Number(e.lng ?? e.lon),employees:[e]
    })).filter(p => p.address && !isMeetingInstruction(p.address) && Number.isFinite(p.lat) && Number.isFinite(p.lng));
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

