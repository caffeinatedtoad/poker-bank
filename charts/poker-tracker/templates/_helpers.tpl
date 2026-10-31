{{/*
Named templates, like small Go funcs reused by every manifest. `include "name" .` calls one.
*/}}

{{/* Resource name: the release name, or "<release>-poker-tracker" if the release is called something else. */}}
{{- define "poker-tracker.fullname" -}}
{{- if contains .Chart.Name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{/* Labels the Service uses to find the pod. These must never change after the first install. */}}
{{- define "poker-tracker.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "poker-tracker.labels" -}}
{{ include "poker-tracker.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}
