
Imports mod_http_request
Imports mod_base_editor
Imports System.SysUtils


Namespace mod_base_editor_cnpj

   Structure TCNPJData
      CNPJ As String
      RazaoSocial As String
      NomeFantasia As String
      Logradouro As String
      Numero As String
      Complemento As String
      CEP As String
      Bairro As String
      Municipio As String
      UF As String
      Email As String
      Telefone As String
      Situacao As String
      DataAbertura As TDateTime
      Tipo As String
      Porte As String
      NaturezaJuridica As String
      DataSituacao As TDateTime
      DataHoraInclusao As TDateTime
      DataHoraUltimaAtualizacao As TDateTime
      OrigemDados As String
      Loaded As Boolean
   End Structure

   Class TCNPJEditor
      Inherits TButtonTextEditor

      Data As TCNPJData

      OnLoadData As TNotifyEvent

      Sub New(pControl As Forms.TWinControl, pLabel As String)
         MyBase.New(pControl, pLabel)
         me.ImageBase64 = "iVBORw0KGgoAAAANSUhEUgAAABAAAAARCAYAAADUryzEAAAACXBIWXMAAA7DAAAOwwHHb6hkAAAAIGNIUk0AAHolAACAgwAA+f8AAIDpAAB1MAAA6mAAADqYAAAXb5JfxUYAAAIASURBVHjapJQ9axRRFIbv7OZjDZEQULGw8hf4Wwa2ME0IIVgEqyWNH90ScLnEZhGRxSZsExiLhRWNWYsIE0GYRYUFP1gLiwGLzAtbXCTFY7H3LgMxVYrDqZ73vO+cc8cA5jJlJK1KqklakhRJqvi6k56M6fRG2IOMzmFOtzfG7tnPgDk9Pa0CkZF0TdIVSVVJRtINSdGbtz//OKA4g+wMBgWkE+gOHU+evnOSqsHBsp9u/OTVo8H3L+mPAgcUbgonv6D/GwYTSL46Gjttjo+PTYDmfY8kmf6HnMzBaAIDD6UO0jPfHTSf9VnfWH8eBBYCLGlh/yh3mYNBPp2eASNg7GsEtF9lbN/fJghUJS36fnX/KP+buant1E2BHCh8HwOdXkZcjyk7qM0ivM9JJ9DPp7bHHpaE8wL2ZX8mEJXsX5dUyYZ50f1UkPrs5wQKx+bGw1kE462HTZhHD7rfbCshGbpZhJA/LxzN3Q5xPcbuWYykudLxRAwtHMbYlqWxY2m+GNDuZSQnOd3XIxo7dgZLmg8OjCQT4GxvjebjDraVIOn21r2tSVyPiesxmxubAV6SZP4L21bC2t01SuI1Sbck3ZS04uG5mQAfG9kFcPi4K6VDq5bOPjJZ78LJlZJIpeQmbG1O0qJJDpIpvHvOdtjOsn9s4cGF01+StGgu+z/4NwBmUTfl1IyMOAAAAABJRU5ErkJggg=="
         me.Mascara = "99.999.999/9999-99"
         me.ButtonHint = "Consultar dados CNPJ"
         me.OnButtonClick = me._handleOnButtonClick
      End Sub

      Private Sub _handleOnButtonClick(pSender As TObject)
         Dim _cnpj As String = me.Text.Trim.Replace(".", "").Replace("-", "").Replace("/", "").Replace(" ", "")
         If _cnpj.Length <> 14 Then
            Forms.MessageBox.Show("CNPJ Inválido, o CNPJ deve conter 14 dígitos.")
            me.SetFocus()
            Exit Sub
         End If
         Try
            Dim _msg As String = Char(13)
            Try
               me._loadFromData7API(_cnpj)
            Catch ex1 As Exception
               _msg += "Consulta 1: " & ex1._GetMessage() & Char(13) & Char(13)
               Try
                  me._loadFromBrasilAPI(_cnpj)
               Catch ex2 As Exception
                  _msg += "Consulta 2: " & ex2._GetMessage() & Char(13) & Char(13)
                  Try
                     me._loadFromReceitaAPI(_cnpj)
                  Catch ex3 As Exception
                     _msg += "Consulta 3: " & ex3._GetMessage() & Char(13) & Char(13)
                     Throw New Exception(_msg)
                  End Try
               End Try
            End Try
            me.Data.Loaded = True
            If me.OnLoadData <> NULL Then
               me.OnLoadData(me)
            End If
         Catch ex As Exception
            Forms.MessageBox.Show("Erro ao obter dados do CNPJ [" & _cnpj & "]:" & Char(13) & ex._GetMessage())
            me.Data.Loaded = False
         End Try
      End Sub

      Private Sub _loadFromData7API(pCNPJ As String)
         Dim _http As HttpRequest
         Dim _response As HttpResponse
         Try
            _http = HttpRequest.WinHttp()
            _http.Headers.Define("Authorization", "Bearer MjAyNTEwMjVUMTAyNzE1OTkzXzFiODNiZDk2OTVjZjcwNTIxMGNlM2JkOWM3ZGM3MzJhMTI1MjA5ZTliMzAxNDVjNTQyNWUyNjU5OGZlNWMxNWI=")
            _response = _http.GETT("http://se7ews.se7esistemas.com.br/cnpj/?digitos=" & pCNPJ & "&forcarAtualizacao=Nao&aplicacao=Data7")
            If Not _response.IsSuccessful Then
               Throw New Exception("Status: " & Cstr(_response.Status) & " - StatusText: " & _response.StatusText & Char(13) & _response.Data.AsText)
            End If
            If _response.Data.IsJson Then
               With _response.Data.AsJson
                  If .Has("cnpj") Then
                     me.Data.CNPJ = .GetString("cnpj")
                  End If
                  If .Has("razaoSocial") Then
                     me.Data.RazaoSocial = .GetString("razaoSocial")
                  End If
                  If .Has("nomeFantasia") Then
                     me.Data.NomeFantasia = .GetString("nomeFantasia")
                  End If
                  If .Has("logradouro") Then
                     me.Data.Logradouro = .GetString("logradouro")
                  End If
                  If .Has("numero") Then
                     me.Data.Numero = .GetString("numero")
                  End If
                  If .Has("complemento") Then
                     me.Data.Complemento = .GetString("complemento")
                  End If
                  If .Has("cep") Then
                     me.Data.CEP = .GetString("cep")
                  End If
                  If .Has("bairro") Then
                     me.Data.Bairro = .GetString("bairro")
                  End If
                  If .Has("municipio") Then
                     me.Data.Municipio = .GetString("municipio")
                  End If
                  If .Has("uf") Then
                     me.Data.UF = .GetString("uf")
                  End If
                  If .Has("email") Then
                     me.Data.Email = .GetString("email")
                  End If
                  If .Has("telefone") Then
                     me.Data.Telefone = .GetString("telefone")
                  End If
                  If .Has("situacao") Then
                     me.Data.Situacao = .GetString("situacao")
                  End If
                  If .Has("dataAbertura") Then
                     me.Data.DataAbertura = me.ISOToDateTime(.GetString("dataAbertura"))
                  End If
                  If .Has("tipo") Then
                     me.Data.Tipo = .GetString("tipo")
                  End If
                  If .Has("porte") Then
                     me.Data.Porte = .GetString("porte")
                  End If
                  If .Has("naturezaJuridica") Then
                     me.Data.NaturezaJuridica = .GetString("naturezaJuridica")
                  End If
                  If .Has("dataSituacao") Then
                     me.Data.DataSituacao = me.ISOToDateTime(.GetString("dataSituacao"))
                  End If
                  If .Has("dataHoraInclusao") Then
                     me.Data.DataHoraInclusao = me.ISOToDateTime(.GetString("dataHoraInclusao"))
                  End If
                  If .Has("dataHoraUltimaAtualizacao") Then
                     me.Data.DataHoraUltimaAtualizacao = me.ISOToDateTime(.GetString("dataHoraUltimaAtualizacao"))
                  End If
                  If .Has("origemDados") Then
                     me.Data.OrigemDados = .GetString("origemDados")
                  End If
                  .Free()
               End With
            End If
         Catch ex As Exception
            Throw New Exception("Erro ao obter dados do CNPJ [" & pCNPJ & "] - Data7 API:" & Char(13) & ex._GetMessage())
         End Try
         If _http <> NULL Then
            _http.Free()
         End If
         If _response <> NULL Then
            _response.Free()
         End If
      End Sub

      Private Sub _loadFromBrasilAPI(pCNPJ As String)
         Dim _http As HttpRequest
         Dim _response As HttpResponse
         Try
            _http = HttpRequest.WinHttp()
            _response = _http.GETT("https://brasilapi.com.br/api/cnpj/v1/" & pCNPJ)
            If Not _response.IsSuccessful Then
               Throw New Exception("Status: " & Cstr(_response.Status) & " - StatusText: " & _response.StatusText & Char(13) & _response.Data.AsText)
            End If
            If _response.Data.IsJson Then
               With _response.Data.AsJson
                  If .Has("cnpj") Then
                     me.Data.CNPJ = .GetString("cnpj")
                  End If
                  If .Has("razao_social") Then
                     me.Data.RazaoSocial = .GetString("razao_social")
                  End If
                  If .Has("nome_fantasia") Then
                     me.Data.NomeFantasia = .GetString("nome_fantasia")
                  End If
                  If .Has("logradouro") Then
                     me.Data.Logradouro = .GetString("logradouro")
                  End If
                  If .Has("numero") Then
                     me.Data.Numero = .GetString("numero")
                  End If
                  If .Has("complemento") Then
                     me.Data.Complemento = .GetString("complemento")
                  End If
                  If .Has("cep") Then
                     me.Data.CEP = .GetString("cep")
                  End If
                  If .Has("bairro") Then
                     me.Data.Bairro = .GetString("bairro")
                  End If
                  If .Has("municipio") Then
                     me.Data.Municipio = .GetString("municipio")
                  End If
                  If .Has("uf") Then
                     me.Data.UF = .GetString("uf")
                  End If
                  If .Has("email") Then
                     me.Data.Email = .GetString("email")
                  End If
                  If .Has("telefone") Then
                     me.Data.Telefone = .GetString("telefone")
                  End If
                  If .Has("descricao_situacao_cadastral") Then
                     me.Data.Situacao = .GetString("descricao_situacao_cadastral")
                  End If
                  If .Has("data_inicio_atividade") Then
                     me.Data.DataAbertura = me.ISOToDateTime(.GetString("data_inicio_atividade"))
                  End If
                  If .Has("descricao_identificador_matriz_filial") Then
                     me.Data.Tipo = .GetString("descricao_identificador_matriz_filial")
                  End If
                  If .Has("porte") Then
                     me.Data.Porte = .GetString("porte")
                  End If
                  If .Has("natureza_juridica") Then
                     me.Data.NaturezaJuridica = .GetString("natureza_juridica")
                  End If
                  If .Has("data_situacao_cadastral") Then
                     me.Data.DataSituacao = me.ISOToDateTime(.GetString("data_situacao_cadastral"))
                  End If
                  If .Has("data_situacao_cadastral") Then
                     me.Data.DataHoraInclusao = me.ISOToDateTime(.GetString("data_situacao_cadastral"))
                  End If
                  If .Has("data_situacao_cadastral") Then
                     me.Data.DataHoraUltimaAtualizacao = me.ISOToDateTime(.GetString("data_situacao_cadastral"))
                  End If
                  me.Data.OrigemDados = "BrasilAPI"
                  .Free()
               End With
            End If
         Catch ex As Exception
            Throw New Exception("Erro ao obter dados do CNPJ [" & pCNPJ & "] - Brasil API:" & Char(13) & ex._GetMessage())
         End Try
         If _http <> NULL Then
            _http.Free()
         End If
         If _response <> NULL Then
            _response.Free()
         End If
      End Sub

      Private Sub _loadFromReceitaAPI(pCNPJ As String)
         Dim _http As HttpRequest
         Dim _response As HttpResponse
         Try
            _http = HttpRequest.WinHttp()
            _response = _http.GETT("https://www.receitaws.com.br/v1/cnpj/1" & pCNPJ)
            print _response.Status
            print _response.StatusText
            print _response.Data.AsText
            If Not _response.IsSuccessful Then
               Throw New Exception("Status: " & Cstr(_response.Status) & " - StatusText: " & _response.StatusText & Char(13) & _response.Data.AsText)
            End If
            If _response.Data.IsJson Then
               With _response.Data.AsJson
                  If .Has("status") Then
                     If UCase(.GetString("status")) = "ERROR" Then
                        Throw New Exception(.GetString("message"))
                     End If
                  End If
                  If .Has("cnpj") Then
                     me.Data.CNPJ = .GetString("cnpj")
                  End If
                  If .Has("nome") Then
                     me.Data.RazaoSocial = .GetString("nome")
                  End If
                  If .Has("fantasia") Then
                     me.Data.NomeFantasia = .GetString("fantasia")
                  End If
                  If .Has("logradouro") Then
                     me.Data.Logradouro = .GetString("logradouro")
                  End If
                  If .Has("numero") Then
                     me.Data.Numero = .GetString("numero")
                  End If
                  If .Has("complemento") Then
                     me.Data.Complemento = .GetString("complemento")
                  End If
                  If .Has("cep") Then
                     me.Data.CEP = .GetString("cep")
                  End If
                  If .Has("bairro") Then
                     me.Data.Bairro = .GetString("bairro")
                  End If
                  If .Has("municipio") Then
                     me.Data.Municipio = .GetString("municipio")
                  End If
                  If .Has("uf") Then
                     me.Data.UF = .GetString("uf")
                  End If
                  If .Has("email") Then
                     me.Data.Email = .GetString("email")
                  End If
                  If .Has("telefone") Then
                     me.Data.Telefone = .GetString("telefone")
                  End If
                  If .Has("situacao") Then
                     me.Data.Situacao = .GetString("situacao")
                  End If
                  If .Has("abertura") Then
                     me.Data.DataAbertura = StrToDate(.GetString("abertura"))
                  End If
                  If .Has("tipo") Then
                     me.Data.Tipo = .GetString("tipo")
                  End If
                  If .Has("porte") Then
                     me.Data.Porte = .GetString("porte")
                  End If
                  If .Has("natureza_juridica") Then
                     me.Data.NaturezaJuridica = .GetString("natureza_juridica")
                  End If
                  If .Has("data_situacao") Then
                     me.Data.DataSituacao = StrToDate(.GetString("data_situacao"))
                  End If
                  If .Has("data_situacao") Then
                     me.Data.DataHoraInclusao = StrToDate(.GetString("data_situacao"))
                  End If
                  If .Has("data_situacao") Then
                     me.Data.DataHoraUltimaAtualizacao = StrToDate(.GetString("data_situacao"))
                  End If
                  me.Data.OrigemDados = "Receita"
                  .Free()
               End With
            End If
         Catch ex As Exception
            Throw New Exception("Erro ao obter dados do CNPJ [" & pCNPJ & "] - Receita API:" & Char(13) & ex._GetMessage())
         End Try
         If _http <> NULL Then
            _http.Free()
         End If
         If _response <> NULL Then
            _response.Free()
         End If
      End Sub

      Private Function ISOToDateTime(pValue As String) As TDateTime
         pValue = Trim(pValue)
         Dim ano As Integer = CInt(Mid(pValue, 1, 4))
         Dim mes As Integer = CInt(Mid(pValue, 6, 2))
         Dim dia As Integer = CInt(Mid(pValue, 9, 2))

         Dim hora As Integer
         Dim minuto As Integer
         Dim segundo As Integer
         Dim millis As Integer = 0

         If pValue.Length > 10 Then
            hora = CInt(Mid(pValue, 12, 2))
            minuto = CInt(Mid(pValue, 15, 2))
         End If

         If pValue.Length >= 17 Then
            If Mid(pValue, 17, 1) = ":" Then
               segundo = CInt(Mid(pValue, 18, 2))
            End If
         End If
         Dim dt As TDateTime = DateTime()
         ISOToDateTime = dt.EncodeDateTime(ano, mes, dia, hora, minuto, segundo, millis)
      End Function

      Sub Free()
         MyBase.Free()
      End Sub

   End Class

End Namespace